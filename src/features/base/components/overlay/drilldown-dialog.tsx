import { useMemo, type ReactNode } from "react";
import { BaseDialog, type DialogHeight, type DialogSize } from "./base-dialog";
import { useDrilldownStack, type DrilldownStack } from "./use-drilldown-stack.hook";

/**
 * DrilldownDialog — 多页面下钻 Dialog(基于 BaseDialog,同容器内 push/back)。
 *
 * **Why**:跟 DrilldownDrawer 同模式,但**保持中央 Dialog 形态不变**。bot detail
 * 这种"主页 = 详情卡片 → 子页 = 管理菜单 → 子子页 = 群列表"的下钻,如果用 Drawer
 * 会跟主 Dialog 形态割裂(中央 + 右侧抽屉共存);用 DrilldownDialog 则在同一个中央
 * Dialog 容器内换内容,顶部 ← 返回切换 title,符合"嵌套下钻"的视觉语义。
 *
 * stack 逻辑跟 DrilldownDrawer 共享 `useDrilldownStack` hook。
 *
 * 用法:
 * ```tsx
 * type Page = "detail" | "menu" | "list";
 * <DrilldownDialog<Page>
 *   open={open}
 *   onClose={onClose}
 *   rootKey="detail"
 *   resetKey={uid}  // uid 切换时复位栈
 *   pages={{
 *     detail: { title: "名片", render: (nav) => <Detail onMenu={() => nav.push("menu")} /> },
 *     menu:   { title: "管理", render: (nav) => <Menu onList={() => nav.push("list")} /> },
 *     list:   { title: "列表", render: () => <List /> },
 *   }}
 * />
 * ```
 */

export type DrilldownDialogNav<K extends string = string> = DrilldownStack<K> & {
  currentKey: K;
};

export interface DrilldownDialogPage<K extends string = string> {
  /** header 标题(可 ReactNode) */
  title: ReactNode;
  /** 渲染本页内容,接收 nav 控制器 */
  render: (nav: DrilldownDialogNav<K>) => ReactNode;
  /** 显式覆盖返回按钮可见性;缺省 stack 深度 > 1 时显示 */
  showBackButton?: boolean;
  /** 显式覆盖关闭按钮可见性;缺省走 BaseDialog 默认(true) */
  showCloseButton?: boolean;
  /** 本页 footer(传给 BaseDialog footer 槽);缺省不渲染 */
  footer?: ReactNode;
}

interface DrilldownDialogProps<K extends string> {
  open: boolean;
  onClose: () => void;
  size?: DialogSize;
  height?: DialogHeight;
  rootKey: K;
  pages: Record<K, DrilldownDialogPage<K>>;
  /**
   * 重置 stack 的依赖键。变化时把 stack 清空回 [rootKey]。
   * 典型用法:bot-detail-modal 切换 uid 时复位下钻栈,避免上个 uid 的子页串台。
   */
  resetKey?: string | number | null;
  description?: ReactNode;
  /** body 区外层 className 覆盖(透传 BaseDialog) */
  contentClassName?: string;
  className?: string;
}

export function DrilldownDialog<K extends string>({
  open,
  onClose,
  size = "md",
  height = "auto",
  rootKey,
  pages,
  resetKey,
  description,
  contentClassName,
  className,
}: DrilldownDialogProps<K>) {
  const stack = useDrilldownStack(rootKey, open, resetKey);
  const nav: DrilldownDialogNav<K> = useMemo(
    () => ({ ...stack, currentKey: stack.current }),
    [stack],
  );

  const page = pages[stack.current];
  if (!page) return null;
  const showBack = page.showBackButton ?? stack.depth > 1;
  const showClose = page.showCloseButton ?? true;

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size={size}
      height={height}
      title={page.title}
      description={description}
      showBackButton={showBack}
      onBack={stack.back}
      showCloseButton={showClose}
      footer={page.footer}
      contentClassName={contentClassName}
      className={className}
    >
      {page.render(nav)}
    </BaseDialog>
  );
}
