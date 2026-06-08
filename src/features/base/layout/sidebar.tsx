import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useMemo, useState } from "react";
import { Languages } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { endpointStore } from "@/features/base/stores/endpoint";
import { useT } from "@/lib/i18n/use-t";
import { useI18n } from "@/lib/i18n/use-i18n";
import { userDetailQueryOptions } from "@/features/base/queries/user.query";
import { SpaceSwitcher } from "@/features/base/layout/space-switcher";
import { SettingsFlyout } from "@/features/base/layout/settings-flyout";
import { MeInfoModal } from "@/features/user/components/me-info-modal";
import { SettingsIcon } from "@/components/ui/icons/settings";
import { collectMenuItems, renderMenuIcon, type MenuItem } from "@/lib/route-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function isActive(item: MenuItem, path: string): boolean {
  return item.to === "/" ? path === "/" : path === item.to || path.startsWith(`${item.to}/`);
}

/**
 * NavItem — 1:1 对齐老仓 `.wk-navrail__item`:
 *  - 容器 56×44,无圆角,无边框
 *  - 未激活:`text-text-primary/30`(对应老仓 `--wk-icon-muted` 30% 透明)
 *  - hover:`bg-brand-tint/40 + text-text-primary/60`(对应老仓 `brand-tint-04 + icon-default`)
 *  - 激活:`text-brand`(无背景)— 老仓"选中态只有颜色变化,无背景,无指示条"
 */
function NavItem({ item, active }: { item: MenuItem; active: boolean }) {
  const t = useT();
  const label = t(item.title);
  return (
    <Link
      to={item.to}
      title={label}
      aria-label={label}
      className={`relative flex h-11 w-14 items-center justify-center transition-colors duration-150 ease-(--ease-emphasized) ${
        active
          ? "text-brand"
          : "text-text-primary/30 hover:bg-brand-tint/40 hover:text-text-primary/60"
      }`}
    >
      {renderMenuIcon(item.icon, 20)}
    </Link>
  );
}

/** 语言切换按钮 — 老仓 NavBottom 翻译图标位,点击直接 toggle zh-CN ↔ en-US。 */
function LanguageToggle() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const tooltipKey =
    locale === "zh-CN" ? "base.settings.switchToEnglish" : "base.settings.switchToChinese";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t(tooltipKey)}
          onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
          className="flex h-11 w-14 cursor-pointer items-center justify-center text-text-primary/30 transition-colors duration-150 ease-(--ease-emphasized) hover:bg-brand-tint/40 hover:text-text-primary/60"
        >
          <Languages size={20} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{t(tooltipKey)}</TooltipContent>
    </Tooltip>
  );
}

interface UserAvatarProps {
  uid: string;
  initial: string;
  isOnline: boolean;
  onClick: () => void;
}

function UserAvatar({ uid, initial, isOnline, onClick }: UserAvatarProps) {
  const t = useT();
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const [failed, setFailed] = useState(false);
  const url = uid ? `${baseURL}/users/${uid}/avatar` : "";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={t("base.sidebar.myInfo")}
          className="relative block cursor-pointer"
        >
          <div className="h-10 w-10 overflow-hidden rounded-full bg-bg-elevated text-sm font-medium text-text-secondary transition-transform duration-150 ease-(--ease-emphasized) hover:scale-105">
            {url && !failed ? (
              <img
                src={url}
                alt={t("base.sidebar.myAvatar")}
                width={40}
                height={40}
                onError={() => setFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center" aria-hidden>
                {initial}
              </div>
            )}
          </div>
          {isOnline ? (
            <span
              className="absolute right-0 bottom-0 box-border h-2 w-2 rounded-full border-2 border-bg-navrail bg-online"
              aria-label={t("base.sidebar.online")}
            />
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>{t("base.sidebar.myInfo")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Sidebar(主导航) — 1:1 对齐老仓 NavRail:
 *
 * **顶部**:用户头像(40×40 + 右下 8px 在线点),点击 → MeInfo modal
 * **中部**:menu items(5 个,56×44,老仓专用 svg icon)
 * **底部**(对齐老仓 NavBottom):
 *   - 分割线
 *   - 语言切换按钮(翻译图标 Languages)→ 直接 toggle zh-CN ↔ en-US
 *   - 设置按钮(齿轮 SettingsIcon)→ 打开 `<SettingsFlyout>` 飞出菜单(**不跳路由**)
 *   - SpaceSwitcher(楼图标 trigger + dropdown)
 */
export function Sidebar() {
  const t = useT();
  const user = useStore(authStore, (s) => s.user);
  const location = useLocation();
  const router = useRouter();
  const qc = useQueryClient();
  const path = location.pathname;
  const items = useMemo(() => collectMenuItems(router), [router]);
  const initial = (user?.name ?? user?.username ?? "?").slice(0, 1).toUpperCase();
  const uid = user?.uid ?? "";
  const [meInfoOpen, setMeInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleAvatarClick = async () => {
    if (uid) {
      try {
        await qc.ensureQueryData(userDetailQueryOptions(uid));
      } catch {
        // 失败也开 modal(老仓 .catch 也 setShowMeInfo(true))
      }
    }
    setMeInfoOpen(true);
  };

  return (
    <>
      <nav
        aria-label={t("base.sidebar.nav")}
        className="relative z-10 flex h-screen w-14 flex-shrink-0 flex-col items-center overflow-visible border-r border-brand-tint bg-bg-navrail"
      >
        <div className="flex flex-shrink-0 flex-col items-center pt-4 pb-2">
          <UserAvatar
            uid={uid}
            initial={initial}
            isOnline={typeof navigator !== "undefined" ? navigator.onLine : true}
            onClick={() => void handleAvatarClick()}
          />
        </div>

        <div className="my-2 h-px w-[22px] flex-shrink-0 bg-border-subtle" />

        <div className="flex flex-1 flex-col items-center gap-0 py-2">
          {items.map((item) => (
            <NavItem key={item.to} item={item} active={isActive(item, path)} />
          ))}
        </div>

        {/* 底部(对齐老仓 NavBottom):分割线 → 语言 → 设置 → SpaceSwitcher */}
        <div className="my-2 h-px w-[22px] flex-shrink-0 bg-border-subtle" />

        <div className="flex flex-shrink-0 flex-col items-center gap-2 pb-4">
          <LanguageToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("base.sidebar.settings")}
                onClick={() => setSettingsOpen((v) => !v)}
                className={`flex h-11 w-14 cursor-pointer items-center justify-center transition-colors duration-150 ease-(--ease-emphasized) ${
                  settingsOpen
                    ? "text-brand"
                    : "text-text-primary/30 hover:bg-brand-tint/40 hover:text-text-primary/60"
                }`}
              >
                <SettingsIcon size={20} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("base.sidebar.settings")}</TooltipContent>
          </Tooltip>
          <SpaceSwitcher />
        </div>
      </nav>

      <SettingsFlyout open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <MeInfoModal open={meInfoOpen} onClose={() => setMeInfoOpen(false)} />
    </>
  );
}
