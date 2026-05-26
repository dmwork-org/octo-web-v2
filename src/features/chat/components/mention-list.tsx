import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Users } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";

/**
 * Mention 候选项 — 字段对齐 TipTap `MentionNodeAttrs = { id, label }`,
 * 这样 suggestion.command 默认行为(把 item 直接作为 attrs 插入 node)就能用。
 *
 * - 普通成员:`{ id: uid, label: name }`
 * - @所有人:`{ id: "@all", label: "所有人" }` — extractFromEditor 见到 id==="@all" 设
 *   SDK Mention.all=true,不入 uids
 */
export interface MentionItem {
  id: string;
  label: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  /** 接 TipTap suggestion onKeyDown,event 是原生 KeyboardEvent */
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/** items 变化时 reset activeIndex 到 0(命名 hook 包 useEffect)。 */
function useResetActiveOnItemsChange(items: MentionItem[], setActiveIndex: (i: number) => void) {
  useEffect(() => {
    setActiveIndex(0);
  }, [items, setActiveIndex]);
}

/**
 * 候选列表(由 mention-suggestion 通过 ReactRenderer 挂到 tippy popover):
 * - 渲染候选项,↑↓ 改 activeIndex,Enter / Tab 触发 command 插入 Mention node
 * - command 由 TipTap suggestion 提供,默认会把 item({id,label})作为 attrs 插入
 */
export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [activeIndex, setActiveIndex] = useState(0);
    useResetActiveOnItemsChange(items, setActiveIndex);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setActiveIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setActiveIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          selectItem(activeIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <ul
        role="listbox"
        className="max-h-64 min-w-[220px] overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg"
      >
        {items.map((c, i) => {
          const active = i === activeIndex;
          const isAll = c.id === "@all";
          return (
            <li
              key={c.id}
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(i);
              }}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                active ? "bg-brand-tint" : "hover:bg-bg-hover"
              }`}
            >
              {isAll ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
                  <Users size={14} />
                </span>
              ) : (
                <ChannelAvatar
                  channel={new Channel(c.id, ChannelTypePerson)}
                  size={24}
                  title={c.label}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-text-primary">{c.label}</span>
              {!isAll ? (
                <span className="shrink-0 truncate font-mono text-[10px] text-text-tertiary">
                  {c.id}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  },
);
MentionList.displayName = "MentionList";
