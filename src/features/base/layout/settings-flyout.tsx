import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authActions } from "@/features/base/stores/auth";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { useSsoProviders } from "@/features/login/hooks/use-sso-providers.hook";
import { toast } from "@/components/semi-bridge/toast";
import { useI18n } from "@/lib/i18n/use-i18n";
import { useT } from "@/lib/i18n/use-t";
import { ChangelogModal } from "@/features/base/layout/changelog-modal";
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
 * 6 个菜单项 + 各自条件渲染(对齐老仓 L116-174):
 *   1. 发现新版本(条件:hasNewVersionLocal)— **本仓暂不接版本检查,条件永远 false 不显示**
 *   2. 账户中心(条件:OIDC + providerId !== 'local' + accountUrl 非空)— 真实跳 window.open
 *   3. 更新日志(始终)— 拉 `getChangelog()` + `<ChangelogModal>`
 *   4. 空间管理(条件:canManageSpace = 任一 space 是 owner/admin)— 占位
 *      老仓走 `window.location.href = "/space"`(独立 admin SPA),新仓没该 SPA
 *      → `console.info + toast "功能开发中"`
 *   5. 打开/关闭桌面通知(始终)— **真实接 Web Notification API**:
 *      打开时申请浏览器权限(`Notification.requestPermission`),拒绝则 toast 提示;
 *      接受 / 已 granted → 写 localStorage flag → `useDesktopNotifications` hook 即时生效
 *   6. 退出登录(始终)— `authActions.signOut()`(内部已整页跳 /login)
 *
 * **形态**:fixed flyout(`left: 56px; bottom: 32px; width: 180px`)+ mask 拦截外部点击。
 */
export function SettingsFlyout({ open, onClose }: SettingsFlyoutProps) {
  const t = useT();
  const { primaryProvider } = useSsoProviders();
  const { data: spaces } = useQuery(mySpacesQueryOptions());
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [notiOff, setNotiOff] = useState<boolean>(isNotificationsOff);
  const { locale, setLocale } = useI18n();
  useCloseOnOutside(open, onClose);

  // 任一 space 是 owner(1) 或 admin(2) 才显"空间管理"
  const canManageSpace = useMemo(
    () => (spaces ?? []).some((s) => s.role === 1 || s.role === 2),
    [spaces],
  );

  // OIDC + 非 local provider + accountUrl 才显"账户中心"
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

  const onClickManageSpace = () => {
    onClose();
    // 空间管理是**独立 admin SPA**(老仓走 `window.location.href = "/space"`,该 SPA 在
    // 另一个 repo 单独部署,跟主 chat 同源共用 token)。本 repo 不重构这个后台 — 等同事
    // 把 admin SPA 部署到 `/space` 后,这里改回 `window.location.href = "/space"`。
    console.info("[settings] 空间管理 clicked → /space (独立 admin SPA,另一个 repo,待部署)");
    toast.info(t("base.settings.manageSpaceUnavailable"));
  };

  // 打开桌面通知:先 requestPermission,granted 才真启用
  const onToggleDesktopNoti = async () => {
    onClose();
    const willEnable = notiOff; // 当前是关,点击是要打开
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

  const onClickToggleLocale = () => {
    onClose();
    setLocale(locale === "zh-CN" ? "en-US" : "zh-CN");
  };

  const onClickLogout = () => {
    onClose();
    authActions.signOut();
  };

  return (
    <>
      {open ? (
        <>
          {/* mask 拦截外部点击关闭(对齐老仓 L109-114) */}
          <div className="fixed inset-0 z-system-overlay" onClick={onClose} aria-hidden />
          {/* flyout 主体(对齐老仓 .wk-navrail__settings-list:left:56 bottom:32 width:180) */}
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
            {canManageSpace ? (
              <FlyoutItem onClick={onClickManageSpace}>{t("base.settings.manageSpace")}</FlyoutItem>
            ) : null}
            <FlyoutItem onClick={() => void onToggleDesktopNoti()}>
              {notiOff ? t("base.settings.openDesktopNoti") : t("base.settings.closeDesktopNoti")}
            </FlyoutItem>
            <FlyoutItem onClick={onClickToggleLocale}>
              {locale === "zh-CN"
                ? t("base.settings.switchToEnglish")
                : t("base.settings.switchToChinese")}
            </FlyoutItem>
            <FlyoutItem onClick={onClickLogout}>{t("base.settings.logout")}</FlyoutItem>
          </ul>
        </>
      ) : null}

      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
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
