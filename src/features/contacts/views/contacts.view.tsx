import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { BotfatherBanner } from "@/features/contacts/components/botfather-banner";
import { ContactsDirectory } from "@/features/contacts/components/contacts-directory";
import { FriendApplies } from "@/features/contacts/components/friend-applies";
import { FriendAdd } from "@/features/contacts/components/friend-add";
import { ChatMain } from "@/features/chat/components/chat-main";

type SubPage = "directory" | "applies" | "add";

/**
 * 通讯录主视图(3 列 layout 中的中 + 右):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(通讯录 + 顶部入口) │
 *   │ BotFather 引荐卡          │
 *   │ 搜索 + 手风琴 3 段        │ ChatMain
 *   │   - 群聊                  │ (chatSelectedStore)
 *   │   - 已添加 AI             │
 *   │   - 全部联系人 (filter)   │
 *   └ 子页:新朋友 / 加好友 ───── ┘
 *
 * 子页(新朋友 / 加好友)P3 后续 wave 升级为侧边推屏;当前用同区域切换实现最小可用。
 */
export function ContactsView() {
  const [page, setPage] = useState<SubPage>("directory");

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
          <span className="truncate text-base font-semibold text-text-primary">
            {page === "directory" ? "通讯录" : page === "applies" ? "新朋友" : "加好友"}
          </span>
          {page === "directory" ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="新朋友"
                title="新朋友"
                onClick={() => setPage("applies")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Users size={16} />
              </button>
              <button
                type="button"
                aria-label="加好友"
                title="加好友"
                onClick={() => setPage("add")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <UserPlus size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPage("directory")}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              返回
            </button>
          )}
        </header>

        {page === "directory" ? (
          <>
            <BotfatherBanner />
            <ContactsDirectory />
          </>
        ) : page === "applies" ? (
          <FriendApplies />
        ) : (
          <FriendAdd />
        )}
      </aside>
      <ChatMain />
    </div>
  );
}
