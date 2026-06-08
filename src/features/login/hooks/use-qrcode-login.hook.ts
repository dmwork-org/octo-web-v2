import { useEffect, useRef, useState } from "react";
import {
  getLoginStatus,
  getLoginUuid,
  loginByAuthcode,
  type LoginResp,
} from "@/features/base/api/endpoints/user.api";
import { buildDevicePayload } from "@/features/login/lib/device";
import { t } from "@/lib/i18n/instance";

/**
 * 二维码登录 hook(对齐老仓 LoginVM `requestUUID + pullLoginStatus + requestLogin`)。
 *
 * **状态机**:
 *   - `getUUID`  → fetch loginuuid → `waitScan`
 *   - `waitScan` → 2s poll loginstatus,根据返回切到 scanned/authed/expired
 *   - `scanned`  → 继续 poll(显头像),等用户 App 确认
 *   - `authed`   → loginByAuthcode → onSuccess
 *   - `expired`  → 显刷新按钮,点击 refresh() 回 getUUID
 *
 * **strict mode 适配**:effect 内全部用闭包局部 `alive` 标记,
 * 不依赖任何 ref(useRef 在 strict mode 双 mount 时容易被 cleanup 残留污染)。
 *
 * **调试**:dev 模式 console.info 关键节点,便于线上 / 联调排查。
 */

export type QrcodeLoginStatus = "getUUID" | "waitScan" | "scanned" | "authed" | "expired";

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_ERRORS = 10;
const LOG = (msg: string, ...args: unknown[]) =>
  // eslint-disable-next-line no-console
  console.info(`[qrcode-login] ${msg}`, ...args);

export interface QrcodeLoginState {
  status: QrcodeLoginStatus;
  uuid: string;
  qrcode: string;
  scannedUid?: string;
  scannedName?: string;
  scannedAvatar?: string;
  loading: boolean;
  error: string | null;
}

export interface UseQrcodeLoginOptions {
  onSuccess: (resp: LoginResp) => void;
}

/** 把 onSuccess 放 ref,避免父 re-render 触发 effect 重启。 */
function useEventRef<T extends (...args: never[]) => unknown>(fn: T) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  return ref;
}

/**
 * 命名 effect — 拉 UUID(`getUUID` 态时)+ 轮询 loginstatus(`waitScan`/`scanned` 态)。
 * `tryReplaceState` 守卫只在闭包还 alive 时 setState,strict mode 双 mount 不污染。
 */
function useQrcodePollEffect(
  status: QrcodeLoginStatus,
  uuid: string,
  setState: React.Dispatch<React.SetStateAction<QrcodeLoginState>>,
  onSuccessRef: React.RefObject<UseQrcodeLoginOptions["onSuccess"]>,
) {
  useEffect(() => {
    let alive = true;

    if (status === "getUUID") {
      LOG("getUUID effect setup → fetching loginuuid");
      setState((p) => ({ ...p, loading: true, error: null }));
      void (async () => {
        try {
          const device = buildDevicePayload();
          LOG("device payload", device);
          const r = await getLoginUuid(device);
          LOG("loginuuid response", r);
          if (!alive) return;
          if (!r?.qrcode) {
            setState((p) => ({
              ...p,
              loading: false,
              error: t("login.qr.errors.missingField"),
            }));
            return;
          }
          setState({
            uuid: r.uuid,
            qrcode: r.qrcode,
            status: "waitScan",
            loading: false,
            error: null,
          });
        } catch (e) {
          LOG("loginuuid error", e);
          if (!alive) return;
          setState((p) => ({ ...p, loading: false, error: t("login.qr.errors.loadFailed") }));
        }
      })();
      return () => {
        alive = false;
      };
    }

    if (status === "waitScan" || status === "scanned") {
      let consecutiveErrors = 0;
      const tick = async () => {
        if (!alive) return;
        try {
          const r = await getLoginStatus(uuid);
          consecutiveErrors = 0;
          if (!alive) return;
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
              if (!alive) return;
              onSuccessRef.current?.(loginResp);
            } catch {
              if (!alive) return;
              setState((p) => ({
                ...p,
                status: "getUUID",
                error: t("login.qr.errors.loginFailed"),
              }));
            }
            return;
          } else if (next === "expired") {
            setState((p) => ({ ...p, status: "expired" }));
            return;
          }
        } catch (e) {
          consecutiveErrors++;
          LOG(`poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`, e);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            if (!alive) return;
            setState((p) => ({
              ...p,
              status: "getUUID",
              error: t("login.qr.errors.networkRefresh"),
            }));
            return;
          }
        }
        if (alive) setTimeout(tick, POLL_INTERVAL_MS);
      };
      setTimeout(tick, POLL_INTERVAL_MS);
      return () => {
        alive = false;
      };
    }

    return () => {
      alive = false;
    };
  }, [status, uuid, setState, onSuccessRef]);
}

export function useQrcodeLogin(options: UseQrcodeLoginOptions): {
  state: QrcodeLoginState;
  refresh: () => void;
} {
  const [state, setState] = useState<QrcodeLoginState>({
    status: "getUUID",
    uuid: "",
    qrcode: "",
    loading: true, // 初始 loading=true 让 view 立即显 spinner(避免空白闪烁)
    error: null,
  });
  const onSuccessRef = useEventRef(options.onSuccess);
  useQrcodePollEffect(state.status, state.uuid, setState, onSuccessRef);

  const refresh = () => {
    setState((p) => ({ ...p, status: "getUUID", error: null }));
  };

  return { state, refresh };
}
