import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { LogOut } from "lucide-react";
import { useMemo } from "react";
import { authActions, authStore } from "@/features/base/stores/auth";
import { collectMenuItems, renderMenuIcon, type MenuItem } from "@/lib/route-menu";

function isActive(item: MenuItem, path: string): boolean {
  return item.to === "/" ? path === "/" : path === item.to || path.startsWith(`${item.to}/`);
}

function NavRow({ item, active }: { item: MenuItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={`group flex flex-col items-center justify-center rounded-md py-2 text-[11px] transition-colors ${
        active ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100"
      }`}
      title={item.title}
    >
      <span className={active ? "text-blue-600" : "text-gray-500 group-hover:text-gray-700"}>
        {renderMenuIcon(item.icon)}
      </span>
      <span className="mt-1 leading-tight">{item.title}</span>
    </Link>
  );
}

export function Sidebar() {
  const user = useStore(authStore, (s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const path = location.pathname;
  const items = useMemo(() => collectMenuItems(router), [router]);

  const handleSignOut = () => {
    authActions.signOut();
    void navigate({ href: "/login", replace: true });
  };

  return (
    <nav
      aria-label="主导航"
      className="flex h-screen w-16 flex-col items-stretch border-r border-gray-200 bg-white py-3"
    >
      <div className="flex flex-col items-center gap-1 px-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600"
          title={user?.name ?? user?.username ?? "anonymous"}
        >
          {(user?.name ?? user?.username ?? "?").slice(0, 1).toUpperCase()}
        </div>
      </div>

      <div className="my-3 h-px self-stretch bg-gray-200" />

      <div className="flex flex-1 flex-col items-stretch gap-1 px-2">
        {items.map((item) => (
          <NavRow key={item.to} item={item} active={isActive(item, path)} />
        ))}
      </div>

      <div className="flex flex-col items-stretch gap-1 px-2">
        <button
          type="button"
          aria-label="退出登录"
          title="退出登录"
          onClick={handleSignOut}
          className="flex flex-col items-center justify-center rounded-md py-2 text-gray-500 hover:bg-gray-100"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
}
