import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { authActions } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { ChangelogModal } from "@/features/base/layout/changelog-modal";
import { VoiceSettingsModal } from "@/features/chat/components/voice-settings-modal";
import { SecretsSettingsModal } from "@/features/base/components/secrets/secrets-settings-modal";
import { OPEN_SECRETS_EVENT, type OpenSecretsPayload } from "@/features/base/events/secrets-events";
import {
  isNotificationsOff,
  isNotificationSupported,
  requestNotificationPermission,
  setNotificationsOff,
} from "@/features/base/lib/notification-util";

interface SettingsFlyoutProps {
  open: boolean;
  onClose: () => void;
}

const ADMIN_BASE_URL = (import.meta.env.VITE_ADMIN_URL ?? "").replace(/\/+$/, "");

/** 点 mask / ESC 关闭 flyout。 */
function useCloseOnOutside(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function useOpenSecretsEvent(
  onClose: () => void,
  openSecrets: (payload: OpenSecretsPayload) => void,
) {
  useEffect(() => {
    const handler = (event: Event) => {
      const payload = (event as CustomEvent<OpenSecretsPayload>).detail ?? {};
      onClose();
      openSecrets(payload);
    };
    window.addEventListener(OPEN_SECRETS_EVENT, handler);
    return () => window.removeEventListener(OPEN_SECRETS_EVENT, handler);
  }, [onClose, openSecrets]);
}

/**
 * 设置飞出菜单 — 1:1 对齐老仓 NavRail/NavSettingsPanel:
 *
 * 7 个菜单项 + 各自条件渲染(对齐老仓 L116-174):
 *   1. 账户中心(条件:OIDC + providerId !== 'local' + accountUrl 非空)— 真实跳 window.open
 *   2. 更新日志(始终)— 拉 `getChangelog()` + `<ChangelogModal>`
 *   3. **语音设置**(始终)— `<VoiceSettingsModal>` (对齐上游 aec22081 NavVoiceSettingsItem)
 *   4. 空间管理(条件:canManageSpace = 任一 space 是 owner/admin)
 *   5. 打开/关闭桌面通知(始终)— 真实接 Web Notification API
 *   6. 退出登录(始终)— `authActions.signOut()`
 *
 * 语言切换不在这里 — 已挪到 NavRail 底部齿轮上方独立按钮(LanguageToggle)。
 */
export function SettingsFlyout({ open, onClose }: SettingsFlyoutProps) {
  const t = useT();
  const { primaryProvider } = useSsoProviders();
  const { data: spaces } = useQuery(mySpacesQueryOptions());
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [secretsSettingsOpen, setSecretsSettingsOpen] = useState(false);
  const [secretsPayload, setSecretsPayload] = useState<OpenSecretsPayload>({});
  const [secretsOpenKey, setSecretsOpenKey] = useState(0);
  const [notiOff, setNotiOff] = useState<boolean>(isNotificationsOff);
  useCloseOnOutside(open, onClose);

  const openSecretsSettings = useCallback((payload: OpenSecretsPayload = {}) => {
    setSecretsPayload(payload);
    setSecretsOpenKey((v) => v + 1);
    setSecretsSettingsOpen(true);
  }, []);
  useOpenSecretsEvent(onClose, openSecretsSettings);

  const canManageSpace = useMemo(
    () => (spaces ?? []).some((s) => s.role === 1 || s.role === 2),
    [spaces],
  );
  const showManageSpace = canManageSpace && !!ADMIN_BASE_URL;

  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  /**
   * 「空间管理」跳转目标 spaceId:优先当前选中的 Space;若当前 Space 不可管理
   * 或未选中,回退到第一个 owner/admin 的 Space。
   */
  const manageSpaceId = useMemo(() => {
    const manageable = (spaces ?? []).filter((s) => s.role === 1 || s.role === 2);
    if (currentSpaceId && manageable.some((s) => s.space_id === currentSpaceId)) {
      return currentSpaceId;
    }
    return manageable[0]?.space_id ?? null;
  }, [spaces, currentSpaceId]);

  const accountUrl = primaryProvider?.accountUrl;
  const showAccountCenter = !!accountUrl;

  const onClickAccountCenter = () => {
    if (!accountUrl) return;
    onClose();
    window.open(accountUrl, "_blank", "noopener,noreferrer");
  };

  const onClickChangelog = () => {
    onClose();
    setChangelogOpen(true);
  };

  const onClickVoiceSettings = () => {
    onClose();
    setVoiceSettingsOpen(true);
  };

  const onClickSecretsSettings = () => {
    onClose();
    openSecretsSettings();
  };

  const onClickManageSpace = () => {
    onClose();
    if (!manageSpaceId) {
      // 理论上 canManageSpace 为真时必有可管理 Space,这里仅做兜底。
      message.info(t("base.settings.manageSpaceUnavailable"));
      return;
    }
    if (!ADMIN_BASE_URL) {
      message.info(t("base.settings.manageSpaceUnavailable"));
      return;
    }
    window.location.href = `${ADMIN_BASE_URL}/admin/space/${encodeURIComponent(
      manageSpaceId,
    )}/members`;
  };

  const onToggleDesktopNoti = async () => {
    onClose();
    const willEnable = notiOff;
    if (willEnable) {
      if (!isNotificationSupported()) {
        message.warning(t("base.settings.notiUnsupported"));
        return;
      }
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        message.warning(t("base.settings.notiDenied"));
        return;
      }
      setNotiOff(false);
      setNotificationsOff(false);
      message.success(t("base.settings.notiOpened"));
    } else {
      setNotiOff(true);
      setNotificationsOff(true);
      message.info(t("base.settings.notiClosed"));
    }
  };

  const onClickLogout = () => {
    onClose();
    authActions.signOut();
  };

  return (
    <>
      {open ? (
        <>
          <div className="fixed inset-0 z-system-overlay" onClick={onClose} aria-hidden />
          <ul
            className="fixed bottom-8 left-14 z-system-overlay flex w-[180px] list-none flex-col rounded-md border border-border-default bg-bg-elevated py-1 shadow-lg"
            role="menu"
          >
            {showAccountCenter ? (
              <FlyoutItem onClick={onClickAccountCenter}>
                {t("base.settings.accountCenter")}
              </FlyoutItem>
            ) : null}
            <FlyoutItem onClick={onClickChangelog}>{t("base.settings.changelog")}</FlyoutItem>
            <FlyoutItem onClick={onClickVoiceSettings}>
              {t("navRail.voiceSettings.title")}
            </FlyoutItem>
            <FlyoutItem onClick={onClickSecretsSettings}>{t("base.secrets.title")}</FlyoutItem>
            {showManageSpace ? (
              <FlyoutItem onClick={onClickManageSpace}>{t("base.settings.manageSpace")}</FlyoutItem>
            ) : null}
            <FlyoutItem onClick={() => void onToggleDesktopNoti()}>
              {notiOff ? t("base.settings.openDesktopNoti") : t("base.settings.closeDesktopNoti")}
            </FlyoutItem>
            <FlyoutItem onClick={onClickLogout}>{t("base.settings.logout")}</FlyoutItem>
          </ul>
        </>
      ) : null}

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
      <VoiceSettingsModal open={voiceSettingsOpen} onClose={() => setVoiceSettingsOpen(false)} />
      <SecretsSettingsModal
        key={secretsOpenKey}
        open={secretsSettingsOpen}
        onClose={() => setSecretsSettingsOpen(false)}
        initialCreate={!!secretsPayload.create}
        prefillName={secretsPayload.name}
        prefillValue={secretsPayload.value}
        prefillKind={secretsPayload.kind}
      />
    </>
  );
}

function FlyoutItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li
      role="menuitem"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] text-text-primary transition-colors hover:bg-bg-hover"
    >
      {children}
    </li>
  );
}
