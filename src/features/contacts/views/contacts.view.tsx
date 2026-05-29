import { Ban, Bookmark, UserPlus, Users } from "lucide-react";
import { BotfatherBanner } from "@/features/contacts/components/botfather-banner";
import { ContactsDirectory } from "@/features/contacts/components/contacts-directory";
import { FriendApplies } from "@/features/contacts/components/friend-applies";
import { FriendAdd } from "@/features/contacts/components/friend-add";
import { BlacklistPage } from "@/features/contacts/components/blacklist";
import { SavedGroupsPage } from "@/features/contacts/components/saved-groups";
import { ChatMain } from "@/features/chat/components/chat-main";
import { Route } from "@/routes/_auth.contacts";

type SubPage = "directory" | "applies" | "add" | "blacklist" | "saved-groups";

const PAGE_TITLE: Record<SubPage, string> = {
  directory: "通讯录",
  applies: "新朋友",
  add: "加好友",
  blacklist: "黑名单",
  "saved-groups": "保存的群",
};

/**
 * 通讯录主视图(3 列 layout 中的中 + 右):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(标题 + 顶部入口)  │
 *   │ Directory:               │ ChatMain
 *   │   BotFather 引荐卡       │ (chatSelectedStore)
 *   │   搜索 + 手风琴 3 段     │
 *   │   - 群聊                 │
 *   │   - 已添加 AI            │
 *   │   - 全部联系人           │
 *   │ 子页:                    │
 *   │   - 新朋友 / 加好友      │
 *   │   - 黑名单 / 保存的群    │
 *   └                            ┘
 *
 * 顶部入口 4 个 icon:新朋友(Users)/ 加好友(UserPlus)/ 黑名单(Ban)/
 * 保存的群(Bookmark)。子页内左上"返回"回 directory。
 *
 * URL `?sub={page}` 持久化选中子页,刷新保留 + 链接可分享。
 */
export function ContactsView() {
  const { sub: page } = Route.useSearch();
  const navigate = Route.useNavigate();

  const goSub = (sub: SubPage) => {
    void navigate({ search: (prev) => ({ ...prev, sub }) });
  };

  const renderBody = () => {
    switch (page) {
      case "directory":
        return (
          <>
            <BotfatherBanner />
            <ContactsDirectory />
          </>
        );
      case "applies":
        return <FriendApplies />;
      case "add":
        return <FriendAdd />;
      case "blacklist":
        return <BlacklistPage />;
      case "saved-groups":
        return <SavedGroupsPage />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
          <span className="truncate text-base font-semibold text-text-primary">
            {PAGE_TITLE[page]}
          </span>
          {page === "directory" ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="新朋友"
                title="新朋友"
                onClick={() => goSub("applies")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Users size={16} />
              </button>
              <button
                type="button"
                aria-label="加好友"
                title="加好友"
                onClick={() => goSub("add")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <UserPlus size={16} />
              </button>
              <button
                type="button"
                aria-label="黑名单"
                title="黑名单"
                onClick={() => goSub("blacklist")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Ban size={16} />
              </button>
              <button
                type="button"
                aria-label="保存的群"
                title="保存的群"
                onClick={() => goSub("saved-groups")}
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <Bookmark size={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => goSub("directory")}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              返回
            </button>
          )}
        </header>

        {renderBody()}
      </aside>
      <ChatMain />
    </div>
  );
}
