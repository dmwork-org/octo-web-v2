import type { ReactNode } from "react";
import { useStore } from "@tanstack/react-store";
import { Sidebar } from "@/features/base/layout/sidebar";
import { useEnsureSpace } from "@/features/base/hooks/use-ensure-space.hook";
import { ChatConfirmDialog } from "@/features/chat/components/chat-confirm-dialog";
import { chatProfileStore, chatProfileActions } from "@/features/chat/stores/chat-profile";
import { UserInfoModal } from "@/features/base/components/modals/user-info-modal";
import { BotDetailModal } from "@/features/base/components/modals/bot-detail-modal";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useEnsureSpace();
  const profile = useStore(chatProfileStore, (s) => s);
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden bg-bg-surface">{children}</main>
      {/*
       * 全 view 共享浮窗 slot — 由对应 store/action 唤起,跨路由都能弹。
       * - ChatConfirmDialog:chatConfirmDialogActions.show
       * - UserInfoModal / BotDetailModal:chatProfileActions.openUser/openBot
       *   (mention click / 头像 click 通过 lib/open-profile.ts 派发,contacts/chat/
       *   matter 等任何 view 都能触发)
       * 历史教训:原来 UserInfoModal mount 在 chat.view,导致 contacts 内打开聊天后
       * 点头像 store 改了但 modal 没人监听 → 弹不出来。
       */}
      <ChatConfirmDialog />
      <UserInfoModal
        uid={profile.kind === "user" ? profile.uid : null}
        onClose={chatProfileActions.close}
      />
      <BotDetailModal
        uid={profile.kind === "bot" ? profile.uid : null}
        onClose={chatProfileActions.close}
      />
    </div>
  );
}
