import { useEffect, type ReactNode } from "react";
import { Users, Columns2 } from "lucide-react";

interface PopoverItemProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function PopoverItem({ icon, label, onClick }: PopoverItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * mousedown 落在 ref 容器外部 → 关闭 popover。
 * 抽出命名 hook 满足 no-useeffect-in-component。
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
    return () => document.removeEventListener("mousedown", handler);
  }, [enabled, onOutside, ref]);
}

interface SidebarAddPopoverProps {
  /** 包裹 add 按钮 + popover 的 wrapper div ref(用于 click-outside 判定)。 */
  containerRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  /** 关注 tab 下额外显示"创建分组"。 */
  showCreateCategory: boolean;
  onClose: () => void;
  onStartGroup: () => void;
  onCreateCategory: () => void;
}

/**
 * sidebar header ➕ 按钮触发的 popover(对应旧 dmworkbase Pages/Chat 内
 * `wk-chat-popover` + ChatMenusPopover):
 *
 *   ┌ [ 创建分组 ]    ← 仅 follow tab(关注)
 *   └ [ 发起群聊 ]    ← 通用
 *
 * - 锚定 add 按钮下方右对齐,absolute 定位在 containerRef 内
 * - mousedown 落在容器外 → 关闭(useClickOutside)
 * - 点项目 → onClose + 跑回调(由父级开对应 modal)
 *
 * 不引第三方 popover 库;父级用 relative wrapper div + absolute 定位即可。
 */
export function SidebarAddPopover({
  containerRef,
  open,
  showCreateCategory,
  onClose,
  onStartGroup,
  onCreateCategory,
}: SidebarAddPopoverProps) {
  useClickOutside(containerRef, onClose, open);
  if (!open) return null;
  return (
    <div className="absolute top-full right-0 z-50 mt-1 flex w-44 flex-col gap-0.5 rounded-md border border-border-subtle bg-bg-surface p-1 shadow-lg">
      {showCreateCategory ? (
        <PopoverItem
          icon={<Columns2 size={14} />}
          label="创建分组"
          onClick={() => {
            onClose();
            onCreateCategory();
          }}
        />
      ) : null}
      <PopoverItem
        icon={<Users size={14} />}
        label="发起群聊"
        onClick={() => {
          onClose();
          onStartGroup();
        }}
      />
    </div>
  );
}
