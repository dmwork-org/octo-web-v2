import { useState } from "react";
import { FriendListContainer } from "@/features/contacts/components/friend-list";
import { FriendApplies } from "@/features/contacts/components/friend-applies";
import { FriendAdd } from "@/features/contacts/components/friend-add";

type ContactsTab = "friends" | "applies" | "add";

const TABS: { id: ContactsTab; label: string }[] = [
  { id: "friends", label: "联系人" },
  { id: "applies", label: "新好友" },
  { id: "add", label: "加好友" },
];

/**
 * 通讯录主视图。
 *
 * P3-D1/D2/D3:左侧 Tab(联系人/新好友/加好友) + 右侧详情占位(P3 后续补)。
 */
export function ContactsView() {
  const [tab, setTab] = useState<ContactsTab>("friends");

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-5 text-base font-semibold text-text-primary">
          通讯录
        </header>
        <nav className="flex shrink-0 items-center gap-1 border-b border-border-subtle bg-bg-surface px-2 py-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex-1 rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ease-(--ease-emphasized) ${
                tab === t.id
                  ? "bg-brand-tint text-text-primary"
                  : "text-text-secondary hover:bg-bg-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        {tab === "friends" ? (
          <FriendListContainer />
        ) : tab === "applies" ? (
          <FriendApplies />
        ) : (
          <FriendAdd />
        )}
      </aside>
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        {tab === "friends"
          ? "从左侧选一个联系人查看详情(P3 后续接入)"
          : tab === "applies"
            ? "新好友申请请在左侧接受或拒绝"
            : "在左侧搜索框输入用户名 / 短号 / 手机号查找用户"}
      </section>
    </div>
  );
}
