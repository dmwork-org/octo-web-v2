import type { ReactNode } from "react";
import { Sidebar } from "@/features/base/layout/sidebar";
import { useEnsureSpace } from "@/features/base/hooks/use-ensure-space.hook";
import { ChatConfirmDialog } from "@/features/chat/components/chat-confirm-dialog";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useEnsureSpace();
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden bg-bg-surface">{children}</main>
      {/*
       * Chat 域 confirm dialog 全局 slot — 由 chatConfirmDialogActions.show 唤起。
       * 当前唯一消费:chatSelectedActions.select 检测未发送附件 → "继续切换?" 弹窗。
       * 挂在 AppShell 而非 chat.view:select() 调用点遍布 contacts / appbot / matter
       * 等多个 view,需要 view 切换也能弹(对齐旧 Pages/Chat WKModal 全 chat 域覆盖)。
       */}
      <ChatConfirmDialog />
    </div>
  );
}
