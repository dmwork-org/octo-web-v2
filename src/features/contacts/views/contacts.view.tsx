import { FriendListContainer } from "@/features/contacts/components/friend-list";

/**
 * 通讯录主视图。
 *
 * P3-D1:左侧好友列表(按字母分组 + 搜索),P3-D2 加新好友申请 tab,P3-D3 加加好友。
 */
export function ContactsView() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-5 text-base font-semibold text-text-primary">
          通讯录
        </header>
        <FriendListContainer />
      </aside>
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        从左侧选一个联系人查看详情(P3-D2 接入)
      </section>
    </div>
  );
}
