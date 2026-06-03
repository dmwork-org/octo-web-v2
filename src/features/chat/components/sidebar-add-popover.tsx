import { useEffect, type ReactNode } from "react";
import { Columns2 } from "lucide-react";

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

interface MenuItemProps {
  icon: ReactNode;
  label: string;
  /** 关注 tab 下"创建分组"项底部加 border-subtle 分隔(对齐老仓 .wk-chat-menu-item) */
  bottomDivider?: boolean;
  onClick: () => void;
}

/**
 * 单个菜单项 — 1:1 对齐老仓 `.wk-chatmenuspopover li` + `.wk-chat-menu-item`:
 * - padding 10px / flex items-center / gap 10px / cursor pointer
 * - icon container 16×16(无圆角 bg wrapper)
 * - title font-size 14(老仓 ChatMenusPopover li)/ 13(老仓 wk-chat-menu-item 创建分组)
 *   统一用 14 简化
 * - hover bg-hover(rgba(0,0,0,0.04))
 */
function MenuItem({ icon, label, bottomDivider, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center p-[10px] text-left text-[14px] text-text-primary transition-colors hover:bg-bg-hover ${
        bottomDivider ? "border-b border-border-subtle" : ""
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="ml-[10px] flex-1 truncate">{label}</span>
    </button>
  );
}

interface SidebarAddPopoverProps {
  /** 包裹 add 按钮 + popover 的 wrapper div ref(用于 click-outside 判定)。 */
  containerRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  /** 关注 tab 下额外显示"创建分组"。 */
  showCreateCategory: boolean;
  onClose: () => void;
  onStartGroup: () => void;
  onAddFriend: () => void;
  onCreateCategory: () => void;
}

/**
 * sidebar header ➕ 按钮触发的 popover(1:1 对齐老仓 Pages/Chat 内
 * `wk-chat-popover` + ChatMenusPopover):
 *
 *   ┌ [ ⬛ 创建分组 ]   ← 仅 follow tab(对齐老仓 wk-chat-menu-item:底部 border-subtle 分隔)
 *   ├ [ 🧑 发起群聊 ]   ← 旧 chatmenus.startchat(icon = popmenus_startchat.png)
 *   └ [ 👥 添加朋友 ]   ← 旧 chatmenus.addfriend(icon = popmenus_friendadd.png)
 *
 * - icon 是老仓静态 PNG(16×16),复制到 public/popmenus/;创建分组用 Columns2 lucide
 *   (老仓也用 Columns2 strokeWidth 1.5)
 * - 锚定 add 按钮下方右对齐,absolute 定位在 containerRef 内
 * - mousedown 落在容器外 → 关闭(useClickOutside)
 * - 行 padding 10 / icon 16×16 / gap 10 / title 14px(对齐老仓 wk-chatmenuspopover li
 *   + wk-chatmenuspopover-avatar + wk-chatmenuspopover-title)
 */
export function SidebarAddPopover({
  containerRef,
  open,
  showCreateCategory,
  onClose,
  onStartGroup,
  onAddFriend,
  onCreateCategory,
}: SidebarAddPopoverProps) {
  useClickOutside(containerRef, onClose, open);
  if (!open) return null;
  return (
    <div className="absolute top-full right-0 z-50 mt-1 flex w-44 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-surface shadow-lg">
      {showCreateCategory ? (
        <MenuItem
          icon={<Columns2 size={16} strokeWidth={1.5} className="text-text-primary" />}
          label="创建分组"
          bottomDivider
          onClick={() => {
            onClose();
            onCreateCategory();
          }}
        />
      ) : null}
      <MenuItem
        icon={
          <img src="/popmenus/popmenus_startchat.png" alt="" className="h-4 w-4 object-contain" />
        }
        label="发起群聊"
        onClick={() => {
          onClose();
          onStartGroup();
        }}
      />
      <MenuItem
        icon={
          <img src="/popmenus/popmenus_friendadd.png" alt="" className="h-4 w-4 object-contain" />
        }
        label="添加朋友"
        onClick={() => {
          onClose();
          onAddFriend();
        }}
      />
    </div>
  );
}
