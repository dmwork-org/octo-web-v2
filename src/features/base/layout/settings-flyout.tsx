import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authActions } from "@/features/base/stores/auth";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { ChangelogModal } from "@/features/base/layout/changelog-modal";
import { VoiceSettingsModal } from "@/features/chat/components/voice-settings-modal";
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
  const [notiOff, setNotiOff] = useState<boolean>(isNotificationsOff);
  useCloseOnOutside(open, onClose);

  const canManageSpace = useMemo(
    () => (spaces ?? []).some((s) => s.role === 1 || s.role === 2),
    [spaces],
  );

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

  const onClickManageSpace = () => {
    onClose();
    console.info("[settings] 空间管理 clicked → /space (独立 admin SPA,另一个 repo,待部署)");
    toast.info(t("base.settings.manageSpaceUnavailable"));
  };

  const onToggleDesktopNoti = async () => {
    onClose();
    const willEnable = notiOff;
    if (willEnable) {
      if (!isNotificationSupported()) {
        toast.warning(t("base.settings.notiUnsupported"));
        return;
      }
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        toast.warning(t("base.settings.notiDenied"));
        return;
      }
      setNotiOff(false);
      setNotificationsOff(false);
      toast.success(t("base.settings.notiOpened"));
    } else {
      setNotiOff(true);
      setNotificationsOff(true);
      toast.info(t("base.settings.notiClosed"));
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
            {canManageSpace ? (
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
