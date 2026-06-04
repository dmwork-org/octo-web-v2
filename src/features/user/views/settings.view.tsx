import { Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import { User, Layers, Bot, LogOut } from "lucide-react";
import { authActions, authStore } from "@/features/base/stores/auth";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { Button } from "@/components/semi-bridge/button";

/**
 * 设置主页(对齐老仓 NavSettingsPanel 导航 hub):
 *
 * - 个人资料 → /meinfo
 * - 空间管理 → 列出我的 spaces,每个点 → /spacesettings?id=
 * - AI 分身 → /persona
 * - 退出登录 → authActions.signOut + 跳 /login
 */
export function SettingsView() {
  const user = useStore(authStore, (s) => s.user);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-lg font-semibold text-text-primary">设置</h1>
        <p className="text-xs text-text-tertiary">{user?.name ?? user?.username ?? "未登录"}</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">账号</h2>
        <Link
          to="/meinfo"
          className="flex items-center gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:bg-bg-hover"
        >
          <User size={16} className="text-text-tertiary" />
          <span className="flex-1 text-sm text-text-primary">个人资料</span>
          <span className="text-xs text-text-tertiary">头像 / 昵称 / 实名</span>
        </Link>
        <Link
          to="/persona"
          className="flex items-center gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:bg-bg-hover"
        >
          <Bot size={16} className="text-text-tertiary" />
          <span className="flex-1 text-sm text-text-primary">AI 分身</span>
          <span className="text-xs text-text-tertiary">代理回复 / Scope 管理</span>
        </Link>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">空间</h2>
        {(spaces ?? []).length === 0 ? (
          <p className="px-3 text-xs text-text-tertiary">暂无空间(可在侧边栏底部加入 / 创建)</p>
        ) : (
          (spaces ?? []).map((sp) => (
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
                  {sp.member_count ?? 0} 人 · 角色{" "}
                  {sp.role === 1 ? "创建者" : sp.role === 2 ? "管理员" : "成员"}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-text-tertiary">账户操作</h2>
        <Button
          type="danger"
          onClick={() => {
            // signOut 内部已 window.location.replace('/login'),不需要再跳
            authActions.signOut();
          }}
        >
          <LogOut size={14} />
          <span className="ml-1">退出登录</span>
        </Button>
      </section>
    </div>
  );
}
