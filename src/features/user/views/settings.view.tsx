import { Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import { User, Layers, Bot, LogOut } from "lucide-react";
import { authActions, authStore } from "@/features/base/stores/auth";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";

/**
 * 设置主页(对齐老仓 NavSettingsPanel 导航 hub):
 *
 * - 个人资料 → /meinfo
 * - 空间管理 → 列出我的 spaces,每个点 → /spacesettings?id=
 * - AI 分身 → /persona
 * - 退出登录 → authActions.signOut + 跳 /login
 */
export function SettingsView() {
  const t = useT();
  const user = useStore(authStore, (s) => s.user);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-lg font-semibold text-text-primary">{t("user.settings.title")}</h1>
        <p className="text-xs text-text-tertiary">
          {user?.name ?? user?.username ?? t("user.settings.notLoggedIn")}
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">
          {t("user.settings.accountSection")}
        </h2>
        <Link
          to="/meinfo"
          className="flex items-center gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:bg-bg-hover"
        >
          <User size={16} className="text-text-tertiary" />
          <span className="flex-1 text-sm text-text-primary">
            {t("user.settings.profileTitle")}
          </span>
          <span className="text-xs text-text-tertiary">{t("user.settings.profileSub")}</span>
        </Link>
        <Link
          to="/persona"
          className="flex items-center gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:bg-bg-hover"
        >
          <Bot size={16} className="text-text-tertiary" />
          <span className="flex-1 text-sm text-text-primary">
            {t("user.settings.personaTitle")}
          </span>
          <span className="text-xs text-text-tertiary">{t("user.settings.personaSub")}</span>
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">
          {t("user.settings.spaceSection")}
        </h2>
        {(spaces ?? []).length === 0 ? (
          <p className="px-3 text-xs text-text-tertiary">{t("user.settings.noSpaces")}</p>
        ) : (
          (spaces ?? []).map((sp) => {
            const roleText =
              sp.role === 1
                ? t("user.settings.roleOwner")
                : sp.role === 2
                  ? t("user.settings.roleAdmin")
                  : t("user.settings.roleMember");
            return (
              <Link
                key={sp.space_id}
                to="/spacesettings"
                search={{ id: sp.space_id }}
                className="flex items-center gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:bg-bg-hover"
              >
                <Layers size={16} className="text-text-tertiary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-text-primary">{sp.name}</span>
                  <span className="truncate text-[11px] text-text-tertiary">
                    {t("user.settings.memberSummary", {
                      values: { count: sp.member_count ?? 0, role: roleText },
                    })}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">
          {t("user.settings.accountActions")}
        </h2>
        <Button
          type="danger"
          onClick={() => {
            // signOut 内部已 window.location.replace('/login'),不需要再跳
            authActions.signOut();
          }}
        >
          <LogOut size={14} />
          <span className="ml-1">{t("user.settings.logout")}</span>
        </Button>
      </section>
    </div>
  );
}
