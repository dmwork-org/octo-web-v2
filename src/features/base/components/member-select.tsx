import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel } from "wukongimjssdk";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { endpointStore } from "@/features/base/stores/endpoint";
import { useT } from "@/lib/i18n/use-t";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 轻量头像:直接用 avatar URL + name 首字母 fallback 渲染。
 * 不走 ChannelAvatar / channelInfo 请求,避免成员选择列表
 * 大量并发请求压垮浏览器连接池(issue #160)。
 */
function LiteAvatar({
  uid,
  name,
  avatar,
  size,
}: {
  uid: string;
  name: string;
  avatar?: string;
  size: number;
}) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const [failed, setFailed] = useState(false);
  const src = avatar
    ? avatar.startsWith("http") || avatar.startsWith("data:")
      ? avatar
      : `${baseURL}/${avatar.replace(/^\/+/, "")}`
    : `${baseURL}/users/${uid}/avatar`;

  const initial = (name || uid).slice(0, 1).toUpperCase();

  if (failed) {
    return (
      <span
        className="shrink-0 rounded-full bg-bg-elevated text-text-secondary"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-bg-elevated object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export interface MemberSelectProps {
  /** 已选 uid 列表(受控)。 */
  value: string[];
  /** 选中变化(单选 / 多选都通过同一回调,单选时 array length ≤ 1)。 */
  onChange: (uids: string[]) => void;
  /**
   * 候选源(对齐旧 dmworktodo useMemberList):
   * - 传 channel:本群成员(子区自动取父群,通过 useGroupSubscribers)
   * - 不传:Space 全员(spaceMembersQueryOptions)
   */
  channel?: Channel;
  /** 单选模式(默认 false 多选)。 */
  single?: boolean;
  /** 排除自己(默认 false — 老仓允许指派给自己)。 */
  excludeSelf?: boolean;
  /** 排除 bot(默认 false — 老仓允许指派给 AI,UI 加 AI badge)。 */
  excludeBots?: boolean;
  /** 排除指定 uids(例:add-members-modal 排除已在群的)。 */
  excludeUids?: string[];
  /** 是否启用搜索输入框(默认 true)。 */
  searchable?: boolean;
  placeholder?: string;
  /** 挂载后聚焦输入框(modal 内首次打开常用)。 */
  autoFocus?: boolean;
}

interface CandidateRow {
  uid: string;
  name: string;
  isBot: boolean;
  avatar?: string;
}

/** 关键字搜索 debounce 300ms。 */
function useDebouncedKeyword(input: string, delay: number) {
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), delay);
    return () => clearTimeout(t);
  }, [input, delay]);
  return debounced;
}

/** 点击 wrapper 外部时回调。extraIgnore 用于 portal 渲染的下拉列表。 */
function useClickOutside(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onOutside: () => void,
  extraIgnore?: () => Element | null,
) {
  useEffect(() => {
    if (!enabled) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      if (extraIgnore) {
        const extra = extraIgnore();
        if (extra && extra.contains(e.target as Node)) return;
      }
      onOutside();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [ref, enabled, onOutside, extraIgnore]);
}

/** Space 成员候选源(无 channel 时);仅 open 时启用 query。 */
function useSpaceCandidates(enabled: boolean): CandidateRow[] {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: enabled && !!spaceId,
  });
  return useMemo<CandidateRow[]>(
    () =>
      (data ?? []).map((m) => ({
        uid: m.uid,
        name: m.name || m.uid,
        isBot: m.robot === 1,
        avatar: m.avatar,
      })),
    [data],
  );
}

/** 群成员候选源(有 channel 时);占位 channel 不发请求,内部 enabled=false。 */
function useChannelCandidates(channel: Channel | undefined): CandidateRow[] {
  const subs = useGroupSubscribers(channel ?? new Channel("", 0), !!channel);
  return useMemo<CandidateRow[]>(
    () =>
      subs
        .filter((s) => !s.isDeleted)
        .map((s) => {
          const og = s.orgData as { robot?: number } | undefined;
          return {
            uid: s.uid,
            name: s.remark || s.name || s.uid,
            isBot: og?.robot === 1,
          };
        }),
    [subs],
  );
}

/**
 * 下拉列表 fixed 定位坐标(issue #162):portal 到 body,
 * 不受父级 transform + overflow:hidden 影响。
 */
function useMemberSelectDropdownPosition(
  open: boolean,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
) {
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number }>({
    left: -9999,
    top: -9999,
    width: 0,
  });

  useEffect(() => {
    if (!open || !wrapperRef.current) return;
    const update = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const spaceBelow = viewportH - rect.bottom;
      const top =
        spaceBelow < 200 && rect.top > spaceBelow ? Math.max(8, rect.top - 204) : rect.bottom + 4;
      setDropdownPos({ left: rect.left, top, width: rect.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, wrapperRef]);

  return dropdownPos;
}

/**
 * 公共成员选择组件(支持单选 / 多选)。
 *
 * 抽公共组件后,选人场景按 props 配置(候选源 + 过滤):
 *
 * | 场景 | channel | excludeSelf | excludeBots | excludeUids |
 * |---|---|---|---|---|
 * | matter CreateMatterModal(matter.view + button)| — | — | — | — |
 * | matter detail AssigneePicker | — | ✓ | ✓ | — |
 * | chat ✓ / Alt+Enter | ✓ | — | — | — |
 * | chat add-members | — | — | — | 已在群成员 |
 *
 * UI 对齐旧 dmworktodo MemberPicker(wrapper + chip + 内嵌 input + absolute dropdown)。
 */
export function MemberSelect({
  value,
  onChange,
  channel,
  single = false,
  excludeSelf = false,
  excludeBots = false,
  excludeUids,
  searchable = true,
  placeholder,
  autoFocus,
}: MemberSelectProps) {
  const t = useT();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const myName = useStore(authStore, (s) => s.user?.name ?? "");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const debouncedKeyword = useDebouncedKeyword(input, 300);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectivePlaceholder = placeholder ?? t("base.memberSelect.placeholder");

  useClickOutside(
    wrapperRef,
    open,
    () => {
      setOpen(false);
      setInput("");
    },
    () => document.getElementById("member-select-dropdown"),
  );

  const spaceCandidates = useSpaceCandidates(open && !channel);
  const channelCandidates = useChannelCandidates(channel);
  const rawCandidates = channel ? channelCandidates : spaceCandidates;

  const candidates = useMemo<CandidateRow[]>(() => {
    const excludeSet = new Set(excludeUids ?? []);
    let list = rawCandidates;
    if (excludeSelf) list = list.filter((m) => m.uid !== myUid);
    if (excludeBots) list = list.filter((m) => !m.isBot);
    if (excludeSet.size > 0) list = list.filter((m) => !excludeSet.has(m.uid));
    if (debouncedKeyword) {
      const kw = debouncedKeyword.toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(kw) || m.uid.toLowerCase().includes(kw),
      );
    }
    return list;
  }, [rawCandidates, excludeUids, excludeSelf, excludeBots, debouncedKeyword, myUid]);

  const valueSet = useMemo(() => new Set(value), [value]);
  const allByUid = useMemo(() => {
    const map = new Map<string, CandidateRow>();
    for (const c of rawCandidates) map.set(c.uid, c);
    return map;
  }, [rawCandidates]);

  const toggle = (uid: string) => {
    if (single) {
      onChange(valueSet.has(uid) ? [] : [uid]);
      setOpen(false);
      setInput("");
      return;
    }
    onChange(valueSet.has(uid) ? value.filter((u) => u !== uid) : [...value, uid]);
    setInput("");
  };

  const remove = (uid: string) => onChange(value.filter((u) => u !== uid));
  const dropdownPos = useMemberSelectDropdownPosition(open, wrapperRef);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      remove(value[value.length - 1]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setInput("");
    }
  };

  const onWrapperClick = () => {
    setOpen(true);
    if (searchable) inputRef.current?.focus();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        onClick={onWrapperClick}
        className={`flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-sm border-0 bg-brand/[0.04] px-2 py-1 text-sm transition-colors hover:bg-brand/[0.06] ${
          open ? "bg-brand/[0.06]" : ""
        }`}
      >
        {value.map((uid) => {
          const row = allByUid.get(uid);
          const name = row?.name ?? (uid === myUid ? myName : uid);
          return (
            <span
              key={uid}
              className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-brand/[0.06] px-2 py-[3px] text-xs leading-5 font-medium text-text-primary transition-colors hover:bg-brand/10"
            >
              <LiteAvatar uid={uid} name={name} avatar={row?.avatar} size={16} />
              <span className="max-w-[120px] truncate">{name}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(uid);
                    }}
                    aria-label={t("base.memberSelect.removeWithName", { values: { name } })}
                    className="flex items-center px-0.5 text-[10px] leading-none text-text-tertiary transition-colors hover:text-error"
                  >
                    ✕
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("base.memberSelect.remove")}</TooltipContent>
              </Tooltip>
            </span>
          );
        })}
        {searchable ? (
          <input
            ref={inputRef}
            autoFocus={autoFocus}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={value.length === 0 ? effectivePlaceholder : ""}
            className="min-w-[80px] flex-1 bg-transparent text-text-primary placeholder:text-brand/30 focus:outline-none"
          />
        ) : value.length === 0 ? (
          <span className="text-brand/30">{effectivePlaceholder}</span>
        ) : null}
      </div>

      {open
        ? createPortal(
            <div
              id="member-select-dropdown"
              style={{
                position: "fixed",
                left: dropdownPos.left,
                top: dropdownPos.top,
                width: dropdownPos.width,
                maxHeight: 200,
                zIndex: "calc(var(--z-dialog) + 10)",
                pointerEvents: "auto",
                overscrollBehavior: "contain",
              }}
              onWheel={(e) => {
                // Radix Dialog 锁了 body scroll,portal 到 body 的下拉列表
                // 滚轮事件会被 body overflow:hidden 吞掉。手动滚动 + 阻止冒泡。
                e.currentTarget.scrollTop += e.deltaY;
                e.stopPropagation();
                e.preventDefault();
              }}
              className="overflow-y-auto rounded-md border border-border-default bg-bg-surface shadow-lg"
            >
              {candidates.length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-text-tertiary">
                  {debouncedKeyword ? t("base.memberSelect.noMatch") : t("base.memberSelect.empty")}
                </p>
              ) : (
                candidates.map((m) => {
                  const checked = valueSet.has(m.uid);
                  return (
                    <button
                      key={m.uid}
                      type="button"
                      onClick={() => toggle(m.uid)}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-bg-hover ${
                        checked ? "bg-brand-tint/40" : ""
                      }`}
                    >
                      <LiteAvatar uid={m.uid} name={m.name} avatar={m.avatar} size={32} />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{m.name}</span>
                      {m.isBot ? <AiBadge size="small" /> : null}
                      {checked ? (
                        <span className="ml-1 text-xs font-semibold text-brand">✓</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
