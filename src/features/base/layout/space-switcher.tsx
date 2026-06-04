import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { useNavigate } from "@tanstack/react-router";
import { Check, Plus, LogIn, Settings } from "lucide-react";
import { spaceActions, spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { CreateSpaceModal } from "@/features/space/components/create-space-modal";
import { JoinSpaceModal } from "@/features/space/components/join-space-modal";
import type { SpaceResp } from "@/features/base/api/endpoints/space.api";

/**
 * 关闭 popover 的 click-outside 监听,封装命名 hook 满足 no-useeffect-in-component。
 */
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
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [enabled, onOutside, ref]);
}

function SpaceTile({
  space,
  size = 34,
  selected = false,
}: {
  space: SpaceResp;
  size?: number;
  selected?: boolean;
}) {
  const initial = (space.name ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-bold text-text-primary ${
        selected ? "ring-2 ring-brand" : ""
      }`}
    >
      {space.logo ? (
        <img src={space.logo} alt={space.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bg-elevated">
          {initial}
        </div>
      )}
    </div>
  );
}

function SwitcherTrigger({ current, onClick }: { current: SpaceResp | null; onClick: () => void }) {
  if (!current) {
    return (
      <button
        type="button"
        aria-label="选择空间"
        title="选择空间"
        onClick={onClick}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-bg-elevated text-xs font-bold text-text-tertiary transition-transform duration-150 ease-(--ease-emphasized) hover:scale-110"
      >
        S
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={`当前空间:${current.name}`}
      title={current.name}
      onClick={onClick}
      className="transition-transform duration-150 ease-(--ease-emphasized) hover:scale-110"
    >
      <SpaceTile space={current} size={34} />
    </button>
  );
}

/**
 * Sidebar 底部的 Space 切换器(对应旧 NavRail 底部 NavSpaceSwitcher):
 *
 * - 触发:34×34 头像方块
 * - Popover:右侧弹出 Space 列表 + 每条 row 齿轮跳设置 + 加入 / 创建空间入口
 * - 点击切换:写 spaceStore → main.tsx 订阅触发 queryClient.clear() + persist
 */
export function SpaceSwitcher() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data: spaces } = useQuery(mySpacesQueryOptions());

  const current = useMemo(
    () => (spaces ?? []).find((s) => s.space_id === currentSpaceId) ?? null,
    [spaces, currentSpaceId],
  );

  const handleSelect = (sp: SpaceResp) => {
    setOpen(false);
    if (sp.space_id !== currentSpaceId) {
      spaceActions.setSpace(sp.space_id);
    }
  };

  const handleOpenSettings = (sp: SpaceResp) => {
    setOpen(false);
    void navigate({ to: "/spacesettings", search: { id: sp.space_id } });
  };

  const list = spaces ?? [];

  return (
    <div ref={ref} className="relative">
      <SwitcherTrigger current={current} onClick={() => setOpen((v) => !v)} />
      {open ? (
        <div className="absolute bottom-0 left-[calc(100%+8px)] z-50 flex max-h-[60vh] w-64 flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
          <header className="shrink-0 border-b border-border-subtle px-3 py-2 text-[11px] font-semibold text-text-tertiary">
            切换空间
          </header>
          <div className="flex flex-1 flex-col overflow-y-auto py-1">
            {list.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">暂无空间</div>
            ) : (
              list.map((sp) => {
                const selected = sp.space_id === currentSpaceId;
                const meta =
                  typeof sp.max_users === "number" && sp.max_users > 0
                    ? `${sp.member_count ?? 0}/${sp.max_users} 人`
                    : `${sp.member_count ?? 0} 人`;
                return (
                  <div
                    key={sp.space_id}
                    className={`flex items-center gap-2 px-3 py-2 transition-colors hover:bg-bg-hover ${
                      selected ? "bg-brand-tint" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(sp)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      <SpaceTile space={sp} size={32} selected={selected} />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-text-primary">
                          {sp.name}
                        </span>
                        <span className="truncate text-[11px] text-text-tertiary">{meta}</span>
                      </div>
                      {selected ? <Check size={14} className="shrink-0 text-brand" /> : null}
                    </button>
                    <button
                      type="button"
                      aria-label={`${sp.name} 设置`}
                      title="空间设置"
                      onClick={() => handleOpenSettings(sp)}
                      className="shrink-0 text-text-tertiary transition-colors hover:text-text-primary"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <footer className="flex shrink-0 flex-col border-t border-border-subtle">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setJoinOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <LogIn size={14} />
              加入空间
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Plus size={14} />
              创建空间
            </button>
          </footer>
        </div>
      ) : null}

      <JoinSpaceModal open={joinOpen} onClose={() => setJoinOpen(false)} />
      <CreateSpaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
