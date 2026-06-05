import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Check } from "lucide-react";
import { spaceActions, spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { JoinSpaceModal } from "@/features/space/components/join-space-modal";
import { BuildingIcon } from "@/components/ui/icons/building";
import { ChevronRightIcon } from "@/components/ui/icons/chevron-right";
import { JoinSpaceIcon } from "@/components/ui/icons/join-space";
import type { SpaceResp } from "@/features/base/api/endpoints/space.api";

/** 点击 trigger 外部时关闭 dropdown(命名 hook 满足 no-useeffect-in-component)。 */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, onOutside, ref]);
}

/** ESC 关闭 dropdown。 */
function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

/**
 * Space 头像 — 1:1 对齐老仓 SpaceAvatar:
 * - switcher 尺寸:36×36,radius 8px,font 14px weight 700,白字
 * - 无 logo 时按 name.charCodeAt(0) % 6 哈希 6 色背景(纯色,非渐变)
 */
const AVATAR_COLORS = [
  "#34C759", // 绿
  "#6569E8", // 紫
  "#FA8C16", // 橙
  "#1AC4B3", // 青
  "#B3D600", // 黄绿
  "#5B9BF5", // 蓝
];

function SpaceAvatar({ name, logo }: { name: string; logo?: string }) {
  if (logo) {
    return <img src={logo} alt={name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />;
  }
  const color = AVATAR_COLORS[(name || "?").charCodeAt(0) % AVATAR_COLORS.length];
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-bold text-white"
      style={{ background: color }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}

/**
 * 选中态对勾 — 1:1 老仓 SpaceItem::IconCheck(14×14,stroke 2.5,brand-accent 色)。
 */
function CheckIcon() {
  return <Check size={14} strokeWidth={2.5} className="text-brand" />;
}

interface SpaceRowProps {
  space: SpaceResp;
  selected: boolean;
  onClick: () => void;
}

/**
 * Space 行 — 1:1 对齐老仓 `.wk-space-item`:
 * - min-height 46px / padding 4px 12px / gap 8px
 * - hover / selected 用 ::before 伪元素铺底(inset 0 4px,radius 6px)
 *   - hover bg:rgba(28,28,35,0.04)
 *   - selected bg:rgba(28,28,35,0.06)
 *   - selected+hover bg:rgba(28,28,35,0.08)
 * - 名字 14px / weight 500 / line 20px / 80% black(selected → 100%)
 * - meta 12px / 40% black / line 18px
 * - selected → 右侧 ✓
 */
function SpaceRow({ space, selected, onClick }: SpaceRowProps) {
  const meta =
    typeof space.max_users === "number" && space.max_users > 0
      ? `${space.member_count ?? 0}/${space.max_users} 人`
      : `${space.member_count ?? 0} 人`;
  const bgClass = selected
    ? "before:bg-[rgba(28,28,35,0.06)] hover:before:bg-[rgba(28,28,35,0.08)]"
    : "hover:before:bg-[rgba(28,28,35,0.04)]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative flex min-h-[46px] cursor-pointer items-center gap-2 rounded-md px-3 py-1 outline-none transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:right-1 before:left-1 before:rounded-md before:content-[''] ${bgClass}`}
    >
      <SpaceAvatar name={space.name} logo={space.logo} />
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <span
          className={`truncate text-[14px] leading-5 font-medium ${
            selected ? "text-[#0d0d0d]" : "text-[rgba(28,28,35,0.80)]"
          }`}
        >
          {space.name}
        </span>
        <span className="truncate text-[12px] leading-[18px] text-[rgba(28,28,35,0.40)]">
          {meta}
        </span>
      </div>
      {selected ? (
        <span className="relative z-[1] flex shrink-0 items-center">
          <CheckIcon />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Sidebar 底部 Space 切换器 — 1:1 对齐老仓 NavRail/NavSpaceSwitcher:
 *
 * **Trigger**:楼图标(56×44 同 menu item 风格)
 *
 * **Dropdown 容器**(对齐老仓 `.wk-navrail__dropdown`):
 *   - 圆角 8 / shadow / 白底 / padding 4 0
 *   - 标题"已加入 Space"(`text-[12px] font-semibold text-[rgba(28,28,35,0.40)]`,padding 8 12)
 *   - 列表:每行 `<SpaceRow>`(46px / 36px 头像 / 14px 名 / 12px meta / ✓)
 *   - 分割线 1px(`rgba(28,28,35,0.15)`,左右 12px margin)
 *   - "加入新 Space"行(compact ActionListItem):
 *      - 高 32px,padding 6 12,gap 8
 *      - 左 16px 登入门图标(60% black)
 *      - 中 label 14px / weight 400 / 纯黑
 *      - 右 16px chevron(40% black)
 */
export function SpaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  useEscClose(open, () => setOpen(false));

  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  const current = useMemo(
    () => (spaces ?? []).find((s) => s.space_id === currentSpaceId) ?? null,
    [spaces, currentSpaceId],
  );

  const handleSelect = (sp: SpaceResp) => {
    setOpen(false);
    if (sp.space_id !== currentSpaceId) spaceActions.setSpace(sp.space_id);
  };

  const list = spaces ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={current?.name ?? "切换 Space"}
        aria-label="切换 Space"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 w-14 cursor-pointer items-center justify-center transition-colors duration-150 ease-(--ease-emphasized) ${
          open
            ? "text-brand"
            : "text-text-primary/30 hover:bg-brand-tint/40 hover:text-text-primary/60"
        }`}
      >
        <BuildingIcon size={20} />
      </button>

      {open ? (
        <div
          className="absolute bottom-0 left-[calc(100%+8px)] z-50 flex max-h-[70vh] w-60 flex-col overflow-hidden rounded-lg border border-border-subtle bg-bg-surface py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 px-3 py-2 text-[12px] font-semibold text-[rgba(28,28,35,0.40)]">
            已加入 Space
          </div>
          <div className="flex flex-1 flex-col gap-1 overflow-y-auto pb-1">
            {list.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">暂无空间</div>
            ) : (
              list.map((sp) => (
                <SpaceRow
                  key={sp.space_id}
                  space={sp}
                  selected={sp.space_id === currentSpaceId}
                  onClick={() => handleSelect(sp)}
                />
              ))
            )}
          </div>
          {/* 分割线:1px,左右 margin 12px(对齐老仓 .wk-navrail__dropdown-divider) */}
          <div className="mx-3 my-1 h-px shrink-0 bg-[rgba(28,28,35,0.15)]" />
          {/* "加入新 Space"compact ActionListItem(对齐老仓 .wk-action-list-item--compact) */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setJoinOpen(true);
            }}
            className="relative flex h-8 cursor-pointer items-center gap-2 px-3 text-left text-[14px] text-[rgba(28,28,35,1)] transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:right-1 before:left-1 before:rounded-md before:content-[''] hover:before:bg-[rgba(28,28,35,0.04)]"
          >
            <span className="relative z-[1] flex h-4 w-4 shrink-0 items-center justify-center text-[rgba(31,28,35,0.60)]">
              <JoinSpaceIcon size={14} />
            </span>
            <span className="relative z-[1] flex-1 font-normal">加入新 Space</span>
            <span className="relative z-[1] flex shrink-0 items-center text-[rgba(28,28,35,0.40)]">
              <ChevronRightIcon size={16} />
            </span>
          </button>
        </div>
      ) : null}

      <JoinSpaceModal open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  );
}
