import type { ReactNode } from "react";
import { MessageCircle, Users, CheckSquare, Sparkles, LayoutGrid } from "lucide-react";
import type { AnyRouter, AnyRoute } from "@tanstack/react-router";

export type MenuIconKey = "chat" | "contacts" | "matter" | "summary" | "appbot";

export interface MenuMeta {
  sort: number;
  title: string;
  icon: MenuIconKey;
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    menu?: MenuMeta;
  }
}

const ICONS: Record<MenuIconKey, (size: number) => ReactNode> = {
  chat: (size) => <MessageCircle size={size} />,
  contacts: (size) => <Users size={size} />,
  matter: (size) => <CheckSquare size={size} />,
  summary: (size) => <Sparkles size={size} />,
  appbot: (size) => <LayoutGrid size={size} />,
};

export function renderMenuIcon(key: MenuIconKey, size = 20): ReactNode {
  return ICONS[key](size);
}

export interface MenuItem extends MenuMeta {
  to: string;
}

export function collectMenuItems(router: AnyRouter): MenuItem[] {
  const out: MenuItem[] = [];
  const routesById = router.routesById as Record<string, AnyRoute>;
  for (const route of Object.values(routesById)) {
    const meta = route.options.staticData?.menu;
    if (!meta) continue;
    out.push({ ...meta, to: route.fullPath });
  }
  return out.sort((a, b) => a.sort - b.sort);
}
