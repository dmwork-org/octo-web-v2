import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Bot, Users } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ExternalBadge } from "@/features/base/components/badges/external-badge";
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
 * - 外部成员:`{ id: uid, label: name, isExternal: true }`(space_id 与当前 Space 不一致)
 */
export interface MentionItem {
  id: string;
  label: string;
  isBot?: boolean;
  isExternal?: boolean;
  externalSpaceName?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

export interface MentionListRef {
  /** 接 TipTap suggestion onKeyDown,event 是原生 KeyboardEvent */
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

type MentionInteractionMode = "keyboard" | "mouse";

/** items 变化时 reset activeIndex 到 0(命名 hook 包 useEffect)。 */
function useResetActiveOnItemsChange(
  items: MentionItem[],
  setActiveIndex: (i: number) => void,
  setMode: (mode: MentionInteractionMode) => void,
) {
  useEffect(() => {
    setActiveIndex(0);
    setMode("keyboard");
  }, [items, setActiveIndex, setMode]);
}

/** activeIndex 变化时把对应 li 确定性滚到容器视口内,避免 smooth scroll 触发 hover 抖动。 */
function useScrollActiveIntoView(
  listRef: React.MutableRefObject<HTMLUListElement | null>,
  itemRefs: React.MutableRefObject<(HTMLLIElement | null)[]>,
  activeIndex: number,
  mode: MentionInteractionMode,
) {
  useEffect(() => {
    if (mode !== "keyboard") return;
    const list = listRef.current;
    const el = itemRefs.current[activeIndex];
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    const viewTop = list.scrollTop;
    const viewBottom = viewTop + list.clientHeight;
    if (top < viewTop) {
      list.scrollTop = top;
    } else if (bottom > viewBottom) {
      list.scrollTop = bottom - list.clientHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, mode]);
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
    const [interactionMode, setInteractionMode] = useState<MentionInteractionMode>("keyboard");
    const listRef = useRef<HTMLUListElement | null>(null);
    const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
    useResetActiveOnItemsChange(items, setActiveIndex, setInteractionMode);
    useScrollActiveIntoView(listRef, itemRefs, activeIndex, interactionMode);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        const action = resolveMentionListKeyAction(event.key, items.length);
        if (action === "previous") {
          setInteractionMode("keyboard");
          setActiveIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (action === "next") {
          setInteractionMode("keyboard");
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
        ref={listRef}
        role="listbox"
        style={{
          maxHeight: "var(--mention-list-max-height, 220px)",
          width: "var(--mention-list-width, 420px)",
        }}
        className="overflow-y-auto rounded-md bg-bg-surface py-[5px] shadow-lg"
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
              onPointerMove={(e) => {
                if (e.pointerType === "mouse" || e.pointerType === "pen") {
                  setInteractionMode("mouse");
                  setActiveIndex(i);
                }
              }}
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
              {c.isExternal ? <ExternalBadge size="small" spaceName={c.externalSpaceName} /> : null}
            </li>
          );
        })}
      </ul>
    );
  },
);
MentionList.displayName = "MentionList";
