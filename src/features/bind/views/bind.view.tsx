import { useCallback, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  checkBindOtp,
  confirmBind,
  createBoundAccount,
  getBindInfo,
  sendBindOtp,
  verifyBindPassword,
  type BindInfoResp,
  type BindMethod,
} from "@/features/base/api/endpoints/oidc.api";
import { clearPendingOidcLogin } from "@/features/login/oidc/pending";
import { authActions, type AuthUser } from "@/features/base/stores/auth";
import { useBindInit } from "@/features/bind/hooks/use-bind-init.hook";
import { deriveCreateState } from "@/features/bind/lib/derive-create-state";
import {
  isVerifyAlreadyConsumed,
  mapBindError,
  type BindEndpoint,
  type BindErrorDisplay,
} from "@/features/bind/lib/error-messages";
import type { BindEntryParams } from "@/features/bind/lib/parse-entry";
import type { LoginResp } from "@/features/base/api/endpoints/user.api";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

const FALLBACK_PROVIDER_ID = "default";

type Stage =
  | { kind: "init" }
  | { kind: "loading_info" }
  | { kind: "choose_method"; info: BindInfoResp }
  | { kind: "verify_password"; info: BindInfoResp }
  | { kind: "verify_otp"; info: BindInfoResp; sent: boolean; sending: boolean }
  | { kind: "confirming"; info: BindInfoResp }
  | { kind: "creating"; info: BindInfoResp }
  | { kind: "success" }
  | { kind: "fatal"; display: BindErrorDisplay };

function loginRespToAuthUser(resp: LoginResp): AuthUser {
  return {
    uid: resp.uid,
    name: resp.name ?? "",
    username: resp.username ?? "",
    app_id: resp.app_id,
    short_no: resp.short_no,
    zone: resp.zone,
    phone: resp.phone,
  };
}

interface BindViewProps {
  initialSearch: string;
}

/**
 * SSO 二级绑定页(对齐老仓 dmworklogin BindPage,694 行,简化 UI 保留状态机 + 安全语义)。
 *
 * **核心安全规则**:
 * - `bind_token` 全程仅 useRef 持有,不入 React state / store / log
 * - URL 立即清(防 token 残留浏览器历史 + Referer + 截图)
 * - sanitizeReturnTo 拦反斜杠 / 双斜杠 / 跨 origin
 *
 * **State machine**:init → loading_info → choose_method → verify_password / verify_otp /
 * (create) → confirming / creating → success / fatal
 *
 * **409 = 已 verified**:verify_* 收到 409 不报错,直接跳 confirm(老仓 PR#72 W2 死循环修复)。
 *
 * **finalize**:成功 → signIn + 清 pending_oidc_login + 跳 returnTo(经 sanitize)。
 */
export function BindView({ initialSearch }: BindViewProps) {
  const t = useT();
  const navigate = useNavigate();
  // bind_token / entry 全程只在 useRef 持有(老仓 PR#73 §2.2 安全约束)
  const entryRef = useRef<BindEntryParams | null>(null);
  const initRanRef = useRef(false);

  const [stage, setStage] = useState<Stage>({ kind: "init" });
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const providerId = () => entryRef.current?.provider ?? FALLBACK_PROVIDER_ID;

  const handleError = useCallback((endpoint: BindEndpoint, err: unknown) => {
    const display = mapBindError(endpoint, err);
    if (display.terminal) {
      setStage({ kind: "fatal", display });
    } else {
      setInlineError(display.message);
    }
  }, []);

  const finalize = useCallback(
    async (resp: LoginResp) => {
      setStage({ kind: "success" });
      clearPendingOidcLogin();
      authActions.signIn(resp.token, loginRespToAuthUser(resp));

      // SSO 跳走前 LoginView 把 invite_code 写到 pendingInviteCode;此处读出来
      // 自动 joinSpace(失败静默,不阻塞登录)。dynamic import 避免 bind 模块强依赖 space.api。
      try {
        const code = window.localStorage.getItem("pendingInviteCode");
        if (code && /^[a-zA-Z0-9_-]+$/.test(code)) {
          const { joinSpace } = await import("@/features/base/api/endpoints/space.api");
          try {
            await joinSpace(code);
          } catch {
            // ignore — 用户进首页可手动重试
          }
          window.localStorage.removeItem("pendingInviteCode");
        }
      } catch {
        // localStorage unavailable(隐身模式 / quota)— 跳过
      }

      const returnTo = entryRef.current?.returnTo ?? "/";
      // 用 replaceState 把当前 /bind 抹掉(不让回退 button 回到二次绑定页)
      void navigate({ href: returnTo, replace: true });
    },
    [navigate],
  );

  const runConfirm = useCallback(
    async (info: BindInfoResp) => {
      const token = entryRef.current?.token;
      if (!token) return;
      setStage({ kind: "confirming", info });
      setInlineError(null);
      try {
        const r = await confirmBind(providerId(), token);
        void finalize(r.login_resp);
      } catch (e) {
        handleError("confirm", e);
      }
    },
    [finalize, handleError],
  );

  const runCreate = useCallback(
    async (info: BindInfoResp) => {
      const token = entryRef.current?.token;
      if (!token) return;
      setStage({ kind: "creating", info });
      setInlineError(null);
      try {
        const r = await createBoundAccount(providerId(), token);
        void finalize(r.login_resp);
      } catch (e) {
        handleError("create", e);
      }
    },
    [finalize, handleError],
  );

  const loadInfo = useCallback(async (params: BindEntryParams) => {
    setStage({ kind: "loading_info" });
    setInlineError(null);
    try {
      const info = await getBindInfo(params.provider ?? FALLBACK_PROVIDER_ID, params.token);
      const createState = deriveCreateState(info);
      const hasAction = info.methods.length > 0 || createState.kind === "available";
      if (!hasAction) {
        const message =
          createState.kind === "blocked" ? createState.reason : tInst("bind.error.noMethods");
        setStage({ kind: "fatal", display: { message, terminal: true } });
        return;
      }
      setStage({ kind: "choose_method", info });
    } catch (e) {
      setStage({ kind: "fatal", display: mapBindError("info", e) });
    }
  }, []);

  const onParsed = useCallback((params: BindEntryParams) => void loadInfo(params), [loadInfo]);
  const onMissing = useCallback(() => {
    setStage({
      kind: "fatal",
      display: { message: tInst("bind.error.linkInvalid"), terminal: true },
    });
  }, []);

  useBindInit(initialSearch, initRanRef, entryRef, onParsed, onMissing);

  const onSelectMethod = async (m: BindMethod) => {
    if (stage.kind !== "choose_method") return;
    setInlineError(null);
    if (m === "password") {
      setStage({ kind: "verify_password", info: stage.info });
      return;
    }
    // sms_otp:自动发送一次
    setStage({ kind: "verify_otp", info: stage.info, sent: false, sending: true });
    const token = entryRef.current?.token;
    if (!token) return;
    try {
      await sendBindOtp(providerId(), token);
      setStage({ kind: "verify_otp", info: stage.info, sent: true, sending: false });
    } catch (e) {
      setStage({ kind: "verify_otp", info: stage.info, sent: false, sending: false });
      handleError("verify_otp_send", e);
    }
  };

  const onResendOtp = async () => {
    if (stage.kind !== "verify_otp") return;
    const token = entryRef.current?.token;
    if (!token) return;
    setBusy(true);
    setInlineError(null);
    try {
      await sendBindOtp(providerId(), token);
      setStage({ ...stage, sent: true });
    } catch (e) {
      handleError("verify_otp_send", e);
    } finally {
      setBusy(false);
    }
  };

  const onSubmitPassword = async () => {
    if (stage.kind !== "verify_password") return;
    if (!identifier || !password) {
      setInlineError(tInst("bind.password.requireFields"));
      return;
    }
    const token = entryRef.current?.token;
    if (!token) return;
    setBusy(true);
    setInlineError(null);
    try {
      await verifyBindPassword(providerId(), { token, identifier, password });
      setPassword(""); // 立即清密码
      await runConfirm(stage.info);
    } catch (e) {
      if (isVerifyAlreadyConsumed(e)) {
        setPassword("");
        await runConfirm(stage.info);
        return;
      }
      handleError("verify_password", e);
    } finally {
      setBusy(false);
    }
  };

  const onSubmitOtp = async () => {
    if (stage.kind !== "verify_otp") return;
    if (!otp || otp.length < 6) {
      setInlineError(tInst("bind.otp.require6Digit"));
      return;
    }
    const token = entryRef.current?.token;
    if (!token) return;
    setBusy(true);
    setInlineError(null);
    try {
      await checkBindOtp(providerId(), { token, code: otp });
      setOtp("");
      await runConfirm(stage.info);
    } catch (e) {
      if (isVerifyAlreadyConsumed(e)) {
        setOtp("");
        await runConfirm(stage.info);
        return;
      }
      handleError("verify_otp_check", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <div className="flex w-96 flex-col gap-4 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-text-primary">{t("bind.title")}</h1>

        {stage.kind === "init" || stage.kind === "loading_info" ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            {t("bind.loading")}
          </div>
        ) : null}

        {stage.kind === "confirming" || stage.kind === "creating" ? (
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            {stage.kind === "creating" ? t("bind.creating") : t("bind.binding")}
          </div>
        ) : null}

        {stage.kind === "success" ? (
          <p className="text-sm text-success">{t("bind.success")}</p>
        ) : null}

        {stage.kind === "fatal" ? (
          <>
            <p className="text-sm text-error">{stage.display.message}</p>
            <Button onClick={() => void navigate({ href: "/login", replace: true })}>
              {t("bind.relogin")}
            </Button>
          </>
        ) : null}

        {stage.kind === "choose_method" ? (
          <ChooseMethodPanel
            info={stage.info}
            onSelect={(m) => void onSelectMethod(m)}
            onCreate={() => void runCreate(stage.info)}
          />
        ) : null}

        {stage.kind === "verify_password" ? (
          <div className="flex flex-col gap-3">
            <label className="block text-sm text-text-secondary">
              {t("bind.password.identifierLabel")}
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
                autoComplete="username"
              />
            </label>
            <label className="block text-sm text-text-secondary">
              {t("bind.password.passwordLabel")}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
                autoComplete="current-password"
              />
            </label>
            {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}
            <Button
              type="primary"
              theme="solid"
              loading={busy}
              onClick={() => void onSubmitPassword()}
              className="w-full"
            >
              {t("bind.password.submit")}
            </Button>
          </div>
        ) : null}

        {stage.kind === "verify_otp" ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-tertiary">
              {stage.sending
                ? t("bind.otp.sending")
                : stage.sent
                  ? t("bind.otp.sentTo", {
                      values: { phone: stage.info.masked_phone ?? t("bind.otp.yourPhone") },
                    })
                  : t("bind.otp.pleaseGet")}
            </p>
            <label className="block text-sm text-text-secondary">
              {t("bind.otp.codeLabel")}
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 tracking-widest text-text-primary"
              />
            </label>
            {inlineError ? <p className="text-xs text-error">{inlineError}</p> : null}
            <div className="flex gap-2">
              <Button onClick={() => void onResendOtp()} disabled={busy || stage.sending}>
                {t("bind.otp.resend")}
              </Button>
              <Button
                type="primary"
                theme="solid"
                loading={busy}
                onClick={() => void onSubmitOtp()}
                className="flex-1"
              >
                {t("bind.password.submit")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChooseMethodPanel({
  info,
  onSelect,
  onCreate,
}: {
  info: BindInfoResp;
  onSelect: (m: BindMethod) => void;
  onCreate: () => void;
}) {
  const t = useT();
  const createState = deriveCreateState(info);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        {t("bind.chooseMethod.intro", {
          values: { name: info.name ?? t("bind.chooseMethod.introExisting") },
        })}
      </p>
      {createState.kind === "available" ? (
        <Button type="primary" theme="solid" className="w-full" onClick={onCreate}>
          {t("bind.chooseMethod.createNew")}
        </Button>
      ) : null}
      {info.methods.includes("password") ? (
        <Button onClick={() => onSelect("password")} className="w-full">
          {t("bind.chooseMethod.password")}
        </Button>
      ) : null}
      {info.methods.includes("sms_otp") ? (
        <Button onClick={() => onSelect("sms_otp")} className="w-full">
          {t("bind.chooseMethod.smsOtp")}
        </Button>
      ) : null}
      {createState.kind === "blocked" ? (
        <p className="text-xs text-text-tertiary">{createState.reason}</p>
      ) : null}
    </div>
  );
}
