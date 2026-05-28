import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { UserName } from "@/features/matter/components/user-name";

interface MemberPickerProps {
  value: string[];
  onChange: (uids: string[]) => void;
  placeholder?: string;
  /** open 时聚焦行为(从外部 modal 打开时触发);忽略 false。 */
  autoFocus?: boolean;
}

/**
 * 关键字搜索 debounce 300ms(命名 hook 包 useEffect)。
 */
function useDebouncedKeyword(input: string, delay: number) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), delay);
    return () => clearTimeout(t);
  }, [input, delay]);
  return debounced;
}

/**
 * 点击 wrapper 外部时回调(命名 hook)。
 */
function useClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, enabled, onOutside]);
}

/**
 * 成员选择器(对齐原 dmworktodo MemberPicker controlled mode):
 *
 *   ┌─ wrapper(点击展开 dropdown,focus input)──────┐
 *   │ [chip 头像 名字 ✕] [chip ...] [搜索 input...]   │
 *   └─────────────────────────────────────────────────┘
 *      ↓ 展开时
 *   ┌─ dropdown(absolute,modal 内部不被遮挡)─────┐
 *   │ [候选 1]                                       │
 *   │ [候选 2]                                       │
 *   └─────────────────────────────────────────────────┘
 *
 * 交互:
 * - 点 wrapper 任何位置展开 dropdown + focus input
 * - input 输入 debounce 300ms 过滤候选(name 包含)
 * - 点候选 toggle 选中(已选会从列表标记 selected,不消失)
 * - chip 上 ✕ 移除,Backspace(input 为空时)删最后一个
 * - Esc 关闭 dropdown,点 wrapper 外也关闭
 *
 * dropdown 是 absolute 定位的兄弟,不用 portal,因此被外层 modal 包裹时
 * 不会被遮挡(原项目同样设计)。
 */
export function MemberPicker({
  value,
  onChange,
  placeholder = "搜索成员…",
  autoFocus,
}: MemberPickerProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const debouncedKeyword = useDebouncedKeyword(input, 300);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(wrapperRef, open, () => {
    setOpen(false);
    setInput("");
  });

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(() => {
    const all = (members ?? []).filter((m) => m.uid !== myUid && m.robot !== 1);
    if (!debouncedKeyword) return all;
    const kw = debouncedKeyword.toLowerCase();
    return all.filter((m) => (m.name ?? "").toLowerCase().includes(kw) || m.uid.includes(kw));
  }, [members, myUid, debouncedKeyword]);

  const toggle = (uid: string) => {
    onChange(value.includes(uid) ? value.filter((u) => u !== uid) : [...value, uid]);
    setInput("");
  };

  const remove = (uid: string) => {
    onChange(value.filter((u) => u !== uid));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      remove(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setInput("");
    }
  };

  const handleWrapperClick = () => {
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        onClick={handleWrapperClick}
        className={`flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-md border bg-bg-elevated px-2.5 py-1.5 text-sm focus-within:bg-bg-base ${
          open ? "border-brand bg-bg-base" : "border-transparent hover:bg-bg-hover"
        }`}
      >
        {value.map((uid) => (
          <span
            key={uid}
            className="inline-flex items-center gap-1 rounded-md bg-bg-surface py-0.5 pr-1 pl-1 ring-1 ring-border-subtle"
          >
            <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={20} title={uid} />
            <UserName uid={uid} className="text-text-primary" />
            <button
              type="button"
              aria-label={`移除 ${uid}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(uid);
              }}
              className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded text-text-tertiary hover:bg-bg-elevated hover:text-text-primary"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[80px] flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
      </div>

      {open ? (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-border-subtle bg-bg-surface p-1 shadow-md">
          {candidates.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-tertiary">
              {debouncedKeyword ? "未找到匹配成员" : "暂无可选成员"}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {candidates.map((m) => {
                const checked = value.includes(m.uid);
                return (
                  <li key={m.uid}>
                    <button
                      type="button"
                      onClick={() => toggle(m.uid)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-hover ${
                        checked ? "bg-brand-tint" : ""
                      }`}
                    >
                      <input type="checkbox" checked={checked} readOnly className="shrink-0" />
                      <ChannelAvatar
                        channel={new Channel(m.uid, ChannelTypePerson)}
                        size={24}
                        title={m.name}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        {m.name || m.uid}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
