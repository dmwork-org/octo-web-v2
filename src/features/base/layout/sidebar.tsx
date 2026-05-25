import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { LogOut } from "lucide-react";
import { useMemo } from "react";
import { authActions, authStore } from "@/features/base/stores/auth";
import { ConnectionBadge } from "@/features/base/layout/connection-badge";
import { SpaceSwitcher } from "@/features/base/layout/space-switcher";
import { collectMenuItems, renderMenuIcon, type MenuItem } from "@/lib/route-menu";

function isActive(item: MenuItem, path: string): boolean {
  return item.to === "/" ? path === "/" : path === item.to || path.startsWith(`${item.to}/`);
}

function NavItem({ item, active }: { item: MenuItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      title={item.title}
      aria-label={item.title}
      className={`relative flex h-11 w-14 items-center justify-center transition-colors duration-150 ease-(--ease-emphasized) ${
        active
          ? "text-brand"
          : "text-text-tertiary/70 hover:bg-brand-tint hover:text-text-secondary"
      }`}
    >
      {renderMenuIcon(item.icon, 20)}
    </Link>
  );
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <div className="relative">
      <div
        className="h-10 w-10 overflow-hidden rounded-full bg-bg-elevated text-sm font-medium text-text-secondary"
        aria-hidden
      >
        <div className="flex h-full w-full items-center justify-center">{initial}</div>
      </div>
      <div
        className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-online ring-2 ring-bg-navrail"
        aria-label="在线"
      />
    </div>
  );
}

export function Sidebar() {
  const user = useStore(authStore, (s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const path = location.pathname;
  const items = useMemo(() => collectMenuItems(router), [router]);
  const initial = (user?.name ?? user?.username ?? "?").slice(0, 1).toUpperCase();

  const handleSignOut = () => {
    authActions.signOut();
    void navigate({ href: "/login", replace: true });
  };

  return (
    <nav
      aria-label="主导航"
      className="relative z-10 flex h-screen w-14 flex-shrink-0 flex-col items-center overflow-visible border-r border-brand-tint bg-bg-navrail"
    >
      <div className="flex flex-shrink-0 flex-col items-center pt-4 pb-2">
        <UserAvatar initial={initial} />
      </div>

      <div className="my-2 h-px w-[22px] flex-shrink-0 bg-border-subtle" />

      <div className="flex flex-1 flex-col items-center gap-0 py-2">
        {items.map((item) => (
          <NavItem key={item.to} item={item} active={isActive(item, path)} />
        ))}
      </div>

      <div className="my-2 h-px w-[22px] flex-shrink-0 bg-border-subtle" />

      <div className="flex flex-shrink-0 flex-col items-center gap-2 pb-4">
        <ConnectionBadge />
        <SpaceSwitcher />
        <button
          type="button"
          aria-label="退出登录"
          title="退出登录"
          onClick={handleSignOut}
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-tertiary/70 transition-colors hover:bg-brand-tint hover:text-text-secondary"
        >
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
}
