import { useMemo, type ReactNode } from "react";
import { BaseDrawer, type DrawerSide, type DrawerSize } from "./base-drawer";
import { useDrilldownStack, type DrilldownStack } from "./use-drilldown-stack.hook";

/**
 * DrilldownDrawer — 多页面下钻抽屉(基于 BaseDrawer)。
 *
 * **Why**:多个 modal 都有"主页 → 子页 → 子子页"导航需求,抽统一模式:
 *   - 内部维护 stack(默认 `[rootKey]`),push/back/reset 三 op
 *   - 当前页 = stack[len-1],BaseDrawer 自动 wire title + showBackButton(depth>1)
 *   - resetKey 变化时复位 stack
 *   - 关闭时 stack 自然销毁(下次打开重新 init)
 *
 * **不重写 BaseDrawer**:只包一层,保留 BaseDrawer 全部 props 语义。
 *
 * stack 逻辑抽到 `useDrilldownStack` hook(DrilldownDialog 也复用同一份)。
 */

export type DrilldownNav<K extends string = string> = DrilldownStack<K> & {
  currentKey: K;
};

export interface DrilldownPage<K extends string = string> {
  /** header 标题(可 ReactNode);本页有效 */
  title: ReactNode;
  /** 渲染本页内容,接收 nav 控制器 */
  render: (nav: DrilldownNav<K>) => ReactNode;
  /** 显式覆盖返回按钮可见性;缺省 stack 深度 > 1 时显示 */
  showBackButton?: boolean;
  /** 显式覆盖关闭按钮可见性;缺省走 BaseDrawer 默认(true) */
  showCloseButton?: boolean;
}

interface DrilldownDrawerProps<K extends string> {
  open: boolean;
  onClose: () => void;
  side?: DrawerSide;
  size?: DrawerSize;
  rootKey: K;
  pages: Record<K, DrilldownPage<K>>;
  resetKey?: string | number | null;
  description?: ReactNode;
}

export function DrilldownDrawer<K extends string>({
  open,
  onClose,
  side = "right",
  size = "md",
  rootKey,
  pages,
  resetKey,
  description,
}: DrilldownDrawerProps<K>) {
  const stack = useDrilldownStack(rootKey, open, resetKey);
  const nav: DrilldownNav<K> = useMemo(() => ({ ...stack, currentKey: stack.current }), [stack]);

  const page = pages[stack.current];
  if (!page) return null;
  const showBack = page.showBackButton ?? stack.depth > 1;
  const showClose = page.showCloseButton ?? true;

  return (
    <BaseDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side={side}
      size={size}
      title={page.title}
      description={description}
      showBackButton={showBack}
      onBack={stack.back}
      showCloseButton={showClose}
    >
      {page.render(nav)}
    </BaseDrawer>
  );
}
