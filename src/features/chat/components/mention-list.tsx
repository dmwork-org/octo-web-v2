import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Bot, Users } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { MENTION_UID_AIS, isStickyMentionUid } from "@/features/base/lib/mention-three-state";

/**
 * Mention 候选项 — 字段对齐 TipTap `MentionNodeAttrs = { id, label }`。
 *
 * - 普通成员:`{ id: uid, label: name }`
 * - @所有人(三态新): `{ id: "-2", label: "所有人" }` — extractOrderedBlocks 见到设 humans=1
 * - @所有AI(三态新): `{ id: "-3", label: "所有AI" }` — extractOrderedBlocks 见到设 ais=1
 * - @所有人(legacy):`{ id: "-1" 或 "@all", label: "所有人" }` — 设 mention.all=1
 * - AI bot 成员:`{ id: uid, label: name, isBot: true }`(普通成员路径 + UI AI 角标)
 */
export interface MentionItem {
  id: string;
  label: string;
  isBot?: boolean;
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
 * - sticky 三态:
 *     "-1" / "@all" → Users 图标(legacy @所有人,mention.all=1)
 *     "-2"          → Users 图标(@所有人,mention.humans=1)
 *     "-3"          → Bot 图标 + AI 角标(@所有AI,mention.ais=1)
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
          const isSticky = isStickyMentionUid(c.id);
          const isAis = c.id === MENTION_UID_AIS;
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
              {isSticky ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
                  {isAis ? <Bot size={14} /> : <Users size={14} />}
                </span>
              ) : (
                <ChannelAvatar
                  channel={new Channel(c.id, ChannelTypePerson)}
                  size={24}
                  title={c.label}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-text-primary">{c.label}</span>
              {isAis || c.isBot ? (
                <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                  AI
                </span>
              ) : null}
              {!isSticky ? (
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
