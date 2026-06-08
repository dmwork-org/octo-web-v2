import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/use-t";

export type DrawerSide = "right" | "left" | "bottom" | "top";
export type DrawerSize = "sm" | "md" | "lg" | "full";

/**
 * 尺寸 token:
 *  - 横向抽屉(right/left):控制宽度
 *  - 纵向抽屉(top/bottom):控制高度
 */
const HORIZONTAL_SIZE: Record<DrawerSize, string> = {
  sm: "w-full max-w-sm",
  md: "w-full max-w-md",
  lg: "w-full max-w-2xl",
  full: "w-full",
};

const VERTICAL_SIZE: Record<DrawerSize, string> = {
  sm: "h-[30vh]",
  md: "h-[50vh]",
  lg: "h-[70vh]",
  full: "h-full",
};

/** side → 卡片定位 + slide-in / slide-out 方向 utility(对齐 tailwindcss-animate) */
const SIDE_POSITION: Record<DrawerSide, string> = {
  right: "right-0 top-0 h-full border-l",
  left: "left-0 top-0 h-full border-r",
  top: "left-0 top-0 w-full border-b",
  bottom: "left-0 bottom-0 w-full border-t",
};

const SIDE_ANIMATION: Record<DrawerSide, string> = {
  right: "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left: "data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  top: "data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
  bottom: "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
};

/**
 * 嵌套层级 Context — 跟 BaseDialog 共用同一套 z-index 体系。
 * Drawer 内可以再开 Dialog / 二级 Drawer,自动选 z-dialog → z-dialog-secondary。
 */
const DrawerNestingContext = createContext(0);

function useNestingZClass(): string {
  const depth = useContext(DrawerNestingContext);
  if (depth >= 2) return "z-dialog-tertiary";
  if (depth >= 1) return "z-dialog-secondary";
  return "z-dialog";
}

interface BaseDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 滑入方向(默认 right) */
  side?: DrawerSide;
  /** 尺寸档(默认 md);横向控宽 / 纵向控高 */
  size?: DrawerSize;
  /** 标题(可选);缺省时 description 必传以满足 Radix a11y */
  title?: ReactNode;
  /** a11y 描述,sr-only 渲染 */
  description?: ReactNode;
  /** 右上 X 关闭按钮(默认 true) */
  showCloseButton?: boolean;
  /** header 左侧 ← 返回按钮(默认 false);用于二级抽屉返回上一级 */
  showBackButton?: boolean;
  /** 自定义返回按钮回调(缺省 = onOpenChange(false)) */
  onBack?: () => void;
  /** 点遮罩是否关闭(默认 true) */
  closeOnMask?: boolean;
  /** Esc 是否关闭(默认 true) */
  closeOnEsc?: boolean;
  /** footer 区(底部按钮),缺省不渲染 */
  footer?: ReactNode;
  /** body 区(中间内容)外层 className 覆盖 */
  contentClassName?: string;
  /** 整个卡片 className 覆盖 */
  className?: string;
  children?: ReactNode;
}

/**
 * 浮动元素壳层统一规范 — 抽屉基础组件(Phase D)。
 *
 * 基于 Radix Dialog(Radix 没专门 Drawer,本质 = Dialog + side 滑入);免费获得
 * focus trap / scroll lock / aria / 嵌套 Esc / portal。
 *
 * **替换目标**:6 个手写抽屉
 * (channel-setting / channel-members / group-management / group-qrcode / group-md / group-avatar)。
 *
 * **动效**:`data-[state=open]:slide-in-from-right` 等 tailwindcss-animate 方向 utility,
 * 替代老仓 `useDrawerEnterTransition` hook(Phase D 末删除)。
 *
 * 用法:
 * ```tsx
 * <BaseDrawer open={open} onOpenChange={setOpen} side="right" size="md" title="群设置">
 *   {...}
 * </BaseDrawer>
 * ```
 *
 * 二级抽屉(用 ArrowLeft 返回上一级,不显 X):
 * ```tsx
 * <BaseDrawer ... showBackButton showCloseButton={false} onBack={() => setSubpage(null)}>
 *   ...
 * </BaseDrawer>
 * ```
 */
export function BaseDrawer({
  open,
  onOpenChange,
  side = "right",
  size = "md",
  title,
  description,
  showCloseButton = true,
  showBackButton = false,
  onBack,
  closeOnMask = true,
  closeOnEsc = true,
  footer,
  contentClassName,
  className,
  children,
}: BaseDrawerProps) {
  const t = useT();
  const depth = useContext(DrawerNestingContext);
  const zClass = useNestingZClass();
  const isHorizontal = side === "right" || side === "left";
  const sizeClass = isHorizontal ? HORIZONTAL_SIZE[size] : VERTICAL_SIZE[size];
  const renderHeader = title || showCloseButton || showBackButton;

  const handleBack = () => {
    if (onBack) onBack();
    else onOpenChange(false);
  };

  return (
    <DrawerNestingContext.Provider value={depth + 1}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          <DialogOverlay className={cn(zClass, "duration-300")} />
          <DialogContent
            // 覆盖 dialog.tsx 默认中央定位 → 边缘对齐 + 全方向 slide
            className={cn(
              zClass,
              "fixed left-auto top-auto translate-x-0 translate-y-0",
              SIDE_POSITION[side],
              sizeClass,
              "rounded-none border-border-default bg-bg-surface shadow-xl",
              // 覆盖 dialog.tsx 的 zoom-in/out(抽屉只走 slide)
              "data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100",
              // 抽屉滑入 300ms 才能看清(tw-animate-css 默认 150ms 太快)
              "duration-300 ease-out",
              SIDE_ANIMATION[side],
              className,
            )}
            onEscapeKeyDown={(e) => {
              if (!closeOnEsc) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (!closeOnMask) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (!closeOnMask) e.preventDefault();
            }}
          >
            {renderHeader ? (
              <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
                {showBackButton ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label={t("base.common.back")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : null}
                {title ? (
                  <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                    {title}
                  </DialogTitle>
                ) : (
                  <span className="flex-1" />
                )}
                {description ? (
                  <DialogDescription className="sr-only">{description}</DialogDescription>
                ) : null}
                {showCloseButton ? (
                  <DialogClose
                    aria-label={t("base.common.close")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none"
                  >
                    <X size={16} />
                  </DialogClose>
                ) : null}
              </header>
            ) : (
              <>
                {title ? <DialogTitle className="sr-only">{title}</DialogTitle> : null}
                {description ? (
                  <DialogDescription className="sr-only">{description}</DialogDescription>
                ) : null}
              </>
            )}
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-auto", contentClassName)}>
              {children}
            </div>
            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </DrawerNestingContext.Provider>
  );
}
