import type { ReactNode } from "react";
import type { AnyRouter, AnyRoute } from "@tanstack/react-router";
import { ChatIcon } from "@/components/ui/icons/chat";
import { ContactsIcon } from "@/components/ui/icons/contacts";
import { SummaryIcon } from "@/components/ui/icons/summary";
import { MatterIcon } from "@/components/ui/icons/matter";
import { AppBotIcon } from "@/components/ui/icons/appbot";

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
  chat: (size) => <ChatIcon size={size} />,
  contacts: (size) => <ContactsIcon size={size} />,
  matter: (size) => <MatterIcon size={size} />,
  summary: (size) => <SummaryIcon size={size} />,
  appbot: (size) => <AppBotIcon size={size} />,
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
