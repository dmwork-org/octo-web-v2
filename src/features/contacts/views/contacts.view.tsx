import { BotfatherBanner } from "@/features/contacts/components/botfather-banner";
import { ContactsDirectory } from "@/features/contacts/components/contacts-directory";
import { ChatMain } from "@/features/chat/components/chat-main";

/**
 * 通讯录主视图(3 列 layout 中的中 + 右),对齐旧 dmworkcontacts Contacts 顶层:
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ BotFather 引荐卡          │ ChatMain
 *   │ 搜索 + 手风琴 3 段        │ (chatSelectedStore)
 *   │   - 群聊                  │
 *   │   - 已添加 AI             │
 *   │   - 全部联系人(全部/AI/人)│
 *   └                            ┘
 *
 * 旧项目"新朋友 / 黑名单 / 保存的群" 3 个入口通过 WKApp.endpoints.
 * registerContactsHeader 注册,但 contactsHeaders() 全项目无调用点 — UI 上
 * 看不到,本期对齐截图不做。"加好友" 在 chat 右上 + 菜单(P4+ 跨模块)。
 */
export function ContactsView() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <BotfatherBanner />
        <ContactsDirectory />
      </aside>
      <ChatMain />
    </div>
  );
}
