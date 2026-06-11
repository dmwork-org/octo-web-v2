import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Bot, Users } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { MENTION_UID_AIS, isStickyMentionUid } from "@/features/base/lib/mention-three-state";
import { resolveMentionListKeyAction } from "./mention-list-keyboard";

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

/** activeIndex 变化时把对应 li 滚到视口内(对齐旧 MentionList scrollIntoView)。 */
function useScrollActiveIntoView(
  itemRefs: React.MutableRefObject<(HTMLLIElement | null)[]>,
  activeIndex: number,
) {
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);
}

/**
 * 候选列表(由 mention-suggestion 通过 ReactRenderer 挂到 tippy popover)。
 *
 * 1:1 对齐旧 dmworkbase MentionList + MentionList.css:
 *   - 容器:min-w 420px / radius 4px / shadow / padding 5px 0
 *   - 行:padding 5px 16px / icon 24×24 圆 / mb 10px(行之间留空隙)
 *   - 命中(active 或 hover):brand 实色背景 + 反白文字
 *   - icon + name + AiBadge(共用组件)— 不显 uid 灰小字(老仓没有)
 *   - sticky 三态(-1/-2/@all → Users / -3 → Bot)用 lucide 图标 + 同 24×24 圆
 *   - 空态行:"没有找到成员"(items.length === 0 直接 null,与候选 popover 自动隐藏一致)
 */
export const MentionList = forwardRef<MentionListRef, MentionListProps>(
  ({ items, command }, ref) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
    useResetActiveOnItemsChange(items, setActiveIndex);
    useScrollActiveIntoView(itemRefs, activeIndex);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const action = resolveMentionListKeyAction(event.key, items.length);
        if (action === "previous") {
          setActiveIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (action === "next") {
          setActiveIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (action === "select") {
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
        className="max-h-[220px] min-w-[420px] overflow-y-auto rounded-md bg-bg-surface py-[5px] shadow-lg"
      >
        {items.map((c, i) => {
          const active = i === activeIndex;
          const isSticky = isStickyMentionUid(c.id);
          const isAis = c.id === MENTION_UID_AIS;
          return (
            <li
              key={c.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="option"
              aria-selected={active}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(i);
              }}
              className={`mb-[10px] flex cursor-pointer items-center gap-2 px-4 py-[5px] transition-colors ${
                active ? "bg-brand text-text-inverse" : "text-text-primary hover:bg-brand-tint"
              }`}
            >
              {isSticky ? (
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    active
                      ? "bg-text-inverse/20 text-text-inverse"
                      : "bg-bg-elevated text-text-secondary"
                  }`}
                >
                  {isAis ? <Bot size={14} /> : <Users size={14} />}
                </span>
              ) : (
                <ChannelAvatar
                  channel={new Channel(c.id, ChannelTypePerson)}
                  size={24}
                  title={c.label}
                />
              )}
              <strong className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                {c.label}
              </strong>
              {isAis || c.isBot ? <AiBadge size="small" /> : null}
            </li>
          );
        })}
      </ul>
    );
  },
);
MentionList.displayName = "MentionList";
