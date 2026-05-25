import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Users } from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";

export interface MentionCandidate {
  /** 特殊 sentinel:'@all' 代表 @所有人 → SDK Mention.all=true */
  uid: string;
  name: string;
  isAll?: boolean;
}

interface MentionPopoverProps {
  /** keyword:已去掉前缀 `@`,按 lowercase prefix match */
  keyword: string;
  /** 弹出位置(屏幕坐标 left/top,by caret rect) */
  anchorLeft: number;
  anchorTop: number;
  /** 选中(键盘 Enter / 鼠标 click) */
  onSelect: (c: MentionCandidate) => void;
  /** 关闭(blur / Esc / 文本不再有触发字符) */
  onClose: () => void;
  /** 父级负责 register active index 状态 */
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  /** 把当前过滤后的候选列表回传给父级,父级用于键盘 Enter 选中 */
  onCandidatesChange: (list: MentionCandidate[]) => void;
}

const MAX_VISIBLE = 8;

/** keyword/members 变化时更新 candidates 并 reset activeIndex */
function useSyncCandidates(
  candidates: MentionCandidate[],
  setActiveIndex: (i: number) => void,
  onCandidatesChange: (list: MentionCandidate[]) => void,
) {
  useEffect(() => {
    setActiveIndex(0);
    onCandidatesChange(candidates);
  }, [candidates, setActiveIndex, onCandidatesChange]);
}

/**
 * @ mention 候选 popover(对应旧 dmworkbase MentionList 简版):
 *
 * - 候选 = `@所有人` + spaceMembers(去 robot / 去自己),按 lowercase prefix 过滤
 * - keyboard:↑↓ 选中(父级管),Enter 确认,Esc 关闭
 * - 鼠标 hover 高亮 + click 选中
 *
 * 旧版还有拼音匹配 / 角色优先 / 头像虚拟滚动,P3+ 后续 wave 接。
 */
export function MentionPopover({
  keyword,
  anchorLeft,
  anchorTop,
  onSelect,
  activeIndex,
  setActiveIndex,
  onCandidatesChange,
}: MentionPopoverProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { data: members } = useQuery(spaceMembersQueryOptions(spaceId));

  const candidates = useMemo<MentionCandidate[]>(() => {
    const kw = keyword.toLowerCase();
    const all: MentionCandidate = { uid: "@all", name: "所有人", isAll: true };
    const base: MentionCandidate[] = [
      all,
      ...(members ?? [])
        .filter((m) => m.uid !== myUid && m.robot !== 1)
        .map((m) => ({ uid: m.uid, name: m.name || m.uid })),
    ];
    if (!kw) return base.slice(0, MAX_VISIBLE);
    return base
      .filter((c) => c.name.toLowerCase().includes(kw) || c.uid.toLowerCase().includes(kw))
      .slice(0, MAX_VISIBLE);
  }, [members, myUid, keyword]);

  useSyncCandidates(candidates, setActiveIndex, onCandidatesChange);

  const listRef = useRef<HTMLUListElement>(null);

  if (candidates.length === 0) return null;

  const style: CSSProperties = {
    position: "fixed",
    left: anchorLeft,
    top: anchorTop,
    zIndex: 70,
    minWidth: 200,
    maxWidth: 280,
  };

  return (
    <ul
      ref={listRef}
      style={style}
      role="listbox"
      className="overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg"
    >
      {candidates.map((c, i) => {
        const active = i === activeIndex;
        return (
          <li
            key={c.uid}
            role="option"
            aria-selected={active}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(c);
            }}
            className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
              active ? "bg-brand-tint" : "hover:bg-bg-hover"
            }`}
          >
            {c.isAll ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
                <Users size={14} />
              </span>
            ) : (
              <ChannelAvatar
                channel={new Channel(c.uid, ChannelTypePerson)}
                size={24}
                title={c.name}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-text-primary">{c.name}</span>
            {!c.isAll ? (
              <span className="shrink-0 truncate font-mono text-[10px] text-text-tertiary">
                {c.uid}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
