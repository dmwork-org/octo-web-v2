import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/use-t";

export type DialogSize = "sm" | "md" | "lg" | "xl" | "fit";
export type DialogHeight = "auto" | "sm" | "md" | "lg" | "full";
export type DialogMask = "default" | "none" | "interactive";

/**
 * 尺寸 token 映射(对齐 plan 设计 sm=384 / md=448 / lg=672 / xl=896 / fit=auto)。
 */
const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "w-full max-w-sm",
  md: "w-full max-w-md",
  lg: "w-full max-w-2xl",
  xl: "w-full max-w-4xl",
  fit: "w-auto",
};

const HEIGHT_CLASS: Record<DialogHeight, string> = {
  auto: "max-h-[85vh]",
  sm: "h-[70vh]",
  md: "h-[80vh]",
  lg: "h-[90vh]",
  full: "h-[calc(100vh-32px)]",
};

/**
 * 嵌套层级 Context — 每层 BaseDialog 把 depth+1 传给子树,自动选 z-index token:
 *   depth 0(根)→ z-dialog
 *   depth 1(主 modal 上又开)→ z-dialog-secondary
 *   depth ≥ 2 → z-dialog-tertiary
 */
const DialogNestingContext = createContext(0);

function useNestingZClass(): string {
  const depth = useContext(DialogNestingContext);
  if (depth >= 2) return "z-dialog-tertiary";
  if (depth >= 1) return "z-dialog-secondary";
  return "z-dialog";
}

interface BaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 卡片宽度档(默认 md=448) */
  size?: DialogSize;
  /** 卡片高度档(默认 auto=max-h-85vh,内容驱动) */
  height?: DialogHeight;
  /** 标题(可选,缺省时 a11y 要求至少传 description) */
  title?: ReactNode;
  /** a11y 描述,屏幕阅读器读;无标题时必传以满足 Radix 要求(sr-only 渲染) */
  description?: ReactNode;
  /** 是否显示右上角 X 关闭按钮(默认 true) */
  showCloseButton?: boolean;
  /**
   * header 左侧 ← 返回按钮(默认 false)— 用于下钻子页返回上一级。
   * 对齐 BaseDrawer 同款语义,DrilldownDialog 自动 wire。
   */
  showBackButton?: boolean;
  /** 自定义返回按钮回调(缺省 = onOpenChange(false)) */
  onBack?: () => void;
  /** 点遮罩是否关闭(默认 true) */
  closeOnMask?: boolean;
  /** Esc 是否关闭(默认 true) */
  closeOnEsc?: boolean;
  /**
   * 遮罩模式:
   * - 'default'(默认):标准黑色半透明 mask + 拦截背景交互
   * - 'none':不渲染 Overlay(罕见,如 toast-like 浮窗)
   * - 'interactive':渲染 Overlay 但 pointer-events:none + bg-transparent
   */
  mask?: DialogMask;
  /** 隐藏整个 header 区(无 title + 无 X);body 自己排版用 */
  hideHeader?: boolean;
  /** footer 区内容(通常是按钮组);缺省不渲染 footer */
  footer?: ReactNode;
  /** body 区(中间内容)外层 className 覆盖,如改 padding */
  contentClassName?: string;
  /** 整个卡片 className 覆盖(尺寸/形状自定义场景);谨慎用 */
  className?: string;
  /**
   * 自定义外部交互拦截(如 portal 下拉列表点击不应关闭弹窗)。
   * 返回 true 阻止 Radix 默认关闭行为。
   */
  shouldPreventOutsideClose?: (e: Event) => boolean;
  children?: ReactNode;
}

/**
 * 浮动元素壳层统一规范 — 中央 Dialog 基础组件。
 *
 * 基于 Radix Dialog + shadcn 模板,免费获得:focus trap / scroll lock / aria /
 * 嵌套 Esc(只关最上层) / portal。
 *
 * 用法:
 * ```tsx
 * <BaseDialog open={open} onOpenChange={setOpen} size="md" title="发起好友申请">
 *   <form>...</form>
 * </BaseDialog>
 * ```
 *
 * **下钻子页**(对齐 BaseDrawer showBackButton/onBack):
 * ```tsx
 * <BaseDialog ... showBackButton onBack={popPage} title="子页标题">
 *   {...}
 * </BaseDialog>
 * ```
 * 一般通过 `DrilldownDialog` 自动 wire,见 overlay/drilldown-dialog.tsx。
 */
export function BaseDialog({
  open,
  onOpenChange,
  size = "md",
  height = "auto",
  title,
  description,
  showCloseButton = true,
  showBackButton = false,
  onBack,
  closeOnMask = true,
  closeOnEsc = true,
  mask = "default",
  hideHeader = false,
  footer,
  contentClassName,
  className,
  shouldPreventOutsideClose,
  children,
}: BaseDialogProps) {
  const t = useT();
  const depth = useContext(DialogNestingContext);
  const zClass = useNestingZClass();
  const renderHeader = !hideHeader && (title || showCloseButton || showBackButton);

  const handleBack = () => {
    if (onBack) onBack();
    else onOpenChange(false);
  };

  return (
    <DialogNestingContext.Provider value={depth + 1}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal>
          {mask !== "none" ? (
            <DialogOverlay
              className={cn(zClass, mask === "interactive" && "pointer-events-none bg-transparent")}
            />
          ) : null}
          <DialogContent
            className={cn(zClass, SIZE_CLASS[size], HEIGHT_CLASS[height], className)}
            onEscapeKeyDown={(e) => {
              if (!closeOnEsc) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (!closeOnMask || mask === "interactive") e.preventDefault();
              else if (shouldPreventOutsideClose?.(e)) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (!closeOnMask || mask === "interactive") e.preventDefault();
              else if (shouldPreventOutsideClose?.(e)) e.preventDefault();
            }}
          >
            {renderHeader ? (
              <DialogHeader>
                {showBackButton ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    aria-label={t("base.common.back")}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none"
                  >
                    <ArrowLeft size={16} />
                  </button>
                ) : null}
                {title ? (
                  <DialogTitle className="min-w-0 flex-1 truncate">{title}</DialogTitle>
                ) : (
                  <DialogTitle className="sr-only">{description || ""}</DialogTitle>
                )}
                <DialogDescription className="sr-only">
                  {description || title || ""}
                </DialogDescription>
                {showCloseButton ? (
                  <DialogClose
                    aria-label={t("base.common.close")}
                    className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none"
                  >
                    <X size={16} />
                  </DialogClose>
                ) : null}
              </DialogHeader>
            ) : (
              // a11y:Radix Dialog 要求必须有 Title;无 header 时把 title/description 用 sr-only 兜底
              <>
                <DialogTitle className="sr-only">{title || description || ""}</DialogTitle>
                <DialogDescription className="sr-only">
                  {description || title || ""}
                </DialogDescription>
              </>
            )}
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-auto", contentClassName)}>
              {children}
            </div>
            {footer ? <DialogFooter>{footer}</DialogFooter> : null}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </DialogNestingContext.Provider>
  );
}
