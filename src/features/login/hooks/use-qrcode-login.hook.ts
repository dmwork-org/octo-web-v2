import { useState, useEffect, useRef } from "react";
import {
  getLoginUuid,
  getLoginStatus,
  loginByAuthcode,
  type LoginResp,
} from "@/features/base/api/endpoints/user.api";
import { buildDevicePayload } from "@/features/login/lib/device";

/**
 * 二维码登录 hook(对齐老仓 LoginVM `requestUUID + pullLoginStatus + requestLogin`)。
 *
 * **状态机**:
 *   - `getUUID`  — 拉新 UUID(初始 / 过期重试)
 *   - `waitScan` — 渲染二维码,2s 轮询 loginstatus
 *   - `scanned`  — 后端报扫描成功(显头像覆盖),继续轮询等确认
 *   - `authed`   — 拿到 auth_code → loginByAuthcode → 调 onSuccess
 *   - `expired`  — 二维码过期,显刷新按钮
 *
 * 网络错误连续 10 次 → 重置到 getUUID(对齐老仓 _pullMaxErrCount)。
 *
 * 组件 unmount → cancelled=true 中断轮询。
 */

export type QrcodeLoginStatus = "getUUID" | "waitScan" | "scanned" | "authed" | "expired";

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_ERRORS = 10;

export interface QrcodeLoginState {
  status: QrcodeLoginStatus;
  uuid: string;
  qrcode: string;
  /** 扫描后的用户头像 / uid(显示头像覆盖用)。 */
  scannedUid?: string;
  scannedName?: string;
  scannedAvatar?: string;
  loading: boolean;
  error: string | null;
}

export interface UseQrcodeLoginOptions {
  onSuccess: (resp: LoginResp) => void;
}

/** 命名 effect hook:负责 UUID 拉取 + 轮询循环(对齐 no-useeffect-in-component)。 */
function useQrcodePollEffect(
  status: QrcodeLoginStatus,
  uuid: string,
  cancelledRef: React.MutableRefObject<boolean>,
  setState: React.Dispatch<React.SetStateAction<QrcodeLoginState>>,
  onSuccess: (resp: LoginResp) => void,
) {
  useEffect(() => {
    if (status === "getUUID") {
      let alive = true;
      void (async () => {
        setState((p) => ({ ...p, loading: true, error: null }));
        try {
          const r = await getLoginUuid(buildDevicePayload());
          if (!alive || cancelledRef.current) return;
          setState((p) => ({
            ...p,
            uuid: r.uuid,
            qrcode: r.qrcode,
            status: "waitScan",
            loading: false,
            scannedUid: undefined,
            scannedAvatar: undefined,
            scannedName: undefined,
            error: null,
          }));
        } catch {
          if (!alive || cancelledRef.current) return;
          setState((p) => ({ ...p, loading: false, error: "二维码加载失败,请重试" }));
        }
      })();
      return () => {
        alive = false;
      };
    }

    if (status === "waitScan" || status === "scanned") {
      let alive = true;
      let consecutiveErrors = 0;
      const tick = async () => {
        if (!alive || cancelledRef.current) return;
        try {
          const r = await getLoginStatus(uuid);
          consecutiveErrors = 0;
          if (!alive || cancelledRef.current) return;
          // 后端 status 是字符串("waitScan" / "scanned" / "authed" / "expired"),
          // user.api 类型把它声成 number 是为兼容旧接口,这里按字符串处理
          const next = String(r.status);
          if (next === "scanned") {
            setState((p) => ({
              ...p,
              status: "scanned",
              scannedUid: r.uid,
              scannedAvatar: r.avatar,
              scannedName: r.name,
            }));
          } else if (next === "authed" && r.auth_code) {
            setState((p) => ({ ...p, status: "authed" }));
            try {
              const loginResp = await loginByAuthcode(r.auth_code, buildDevicePayload());
              if (!alive || cancelledRef.current) return;
              onSuccess(loginResp);
            } catch {
              if (!alive || cancelledRef.current) return;
              setState((p) => ({ ...p, status: "getUUID", error: "登录失败,请重新扫码" }));
            }
            return; // 终态,不再轮询
          } else if (next === "expired") {
            setState((p) => ({ ...p, status: "expired" }));
            return;
          }
        } catch {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            if (!alive || cancelledRef.current) return;
            setState((p) => ({ ...p, status: "getUUID", error: "网络异常,重新获取二维码" }));
            return;
          }
        }
        if (alive && !cancelledRef.current) {
          setTimeout(tick, POLL_INTERVAL_MS);
        }
      };
      setTimeout(tick, POLL_INTERVAL_MS);
      return () => {
        alive = false;
      };
    }

    return undefined;
  }, [status, uuid, cancelledRef, setState, onSuccess]);
}

/** 命名 hook:unmount 时 cancelledRef=true 中断所有 in-flight 轮询。 */
function useCancelOnUnmount(cancelledRef: React.MutableRefObject<boolean>) {
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, [cancelledRef]);
}

export function useQrcodeLogin(options: UseQrcodeLoginOptions): {
  state: QrcodeLoginState;
  refresh: () => void;
} {
  const [state, setState] = useState<QrcodeLoginState>({
    status: "getUUID",
    uuid: "",
    qrcode: "",
    loading: false,
    error: null,
  });
  const cancelledRef = useRef(false);

  useCancelOnUnmount(cancelledRef);
  useQrcodePollEffect(state.status, state.uuid, cancelledRef, setState, options.onSuccess);

  const refresh = () => {
    setState((p) => ({ ...p, status: "getUUID", error: null }));
  };

  return { state, refresh };
}
