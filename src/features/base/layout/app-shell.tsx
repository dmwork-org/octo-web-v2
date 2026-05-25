import type { ReactNode } from "react";
import { Sidebar } from "@/features/base/layout/sidebar";
import { useEnsureSpace } from "@/features/base/hooks/use-ensure-space.hook";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useEnsureSpace();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden bg-bg-surface">{children}</main>
    </div>
  );
}
