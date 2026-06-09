import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { BaseDrawer, type DrawerSide, type DrawerSize } from "./base-drawer";

/**
 * DrilldownDrawer — 多页面下钻抽屉(基于 BaseDrawer)。
 *
 * **Why**:本仓多个 modal 都有"主页 → 子页 → 子子页"导航需求(group-management 的
 * view/addManager/addBotAdmin,channel-setting 的 root/avatar/qrcode/md/manage,
 * BotManage 的 menu/mention-free 等),目前各自手写 mode state + showBackButton +
 * onBack switch。抽一个统一模式:
 *   - 内部维护 stack(默认 `[rootKey]`),push/back/reset 三 op
 *   - 当前页 = stack[len-1],BaseDrawer 自动 wire title + showBackButton(depth>1)
 *   - resetKey 变化时复位 stack(典型场景:bot detail 切换 uid → BotManage 复位到 menu)
 *   - 关闭时 stack 自然销毁(下次打开重新 init)
 *
 * **不重写 BaseDrawer**:只包一层,保留 BaseDrawer 全部 props 语义。
 *
 * 用法:
 * ```tsx
 * type Page = "menu" | "list";
 * <DrilldownDrawer<Page>
 *   open={open}
 *   onClose={onClose}
 *   rootKey="menu"
 *   pages={{
 *     menu: { title: "菜单", render: (nav) => <Menu onPick={() => nav.push("list")} /> },
 *     list: { title: "列表", render: (nav) => <List onItem={nav.back} /> },
 *   }}
 * />
 * ```
 */

export interface DrilldownNav<K extends string = string> {
  push: (key: K) => void;
  back: () => void;
  reset: () => void;
  currentKey: K;
  /** stack 深度,1=根页,>1=子页 */
  depth: number;
}

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
  /** 默认 right */
  side?: DrawerSide;
  /** 默认 md */
  size?: DrawerSize;
  /** 根页面 key,必须存在于 pages 中 */
  rootKey: K;
  /** 页面表:key → { title, render } */
  pages: Record<K, DrilldownPage<K>>;
  /**
   * 重置 stack 的依赖键。变化时把 stack 清空回 [rootKey]。
   * 典型用法:bot-detail-modal 切换 uid 时,BotManage 应回到 menu 页避免串台。
   */
  resetKey?: string | number | null;
  /** a11y 描述,sr-only */
  description?: ReactNode;
}

/**
 * 把 stack 管理 + 复位 effect 抽到命名 hook(no-useeffect-in-component 规则要求)。
 * 返回 stack 当前值 + push/back/reset 三 op。
 */
function useDrilldownStack<K extends string>(
  rootKey: K,
  open: boolean,
  resetKey?: string | number | null,
): {
  current: K;
  depth: number;
  push: (key: K) => void;
  back: () => void;
  reset: () => void;
} {
  const [stack, setStack] = useState<K[]>([rootKey]);

  useResetStackOnDeps(setStack, rootKey, resetKey);
  useResetStackOnClose(setStack, rootKey, open);

  const push = useCallback((key: K) => {
    setStack((s) => [...s, key]);
  }, []);
  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const reset = useCallback(() => {
    setStack([rootKey]);
  }, [rootKey]);

  const current = stack[stack.length - 1] ?? rootKey;
  return { current, depth: stack.length, push, back, reset };
}

/** resetKey 变化时复位 stack 到 [rootKey]。 */
function useResetStackOnDeps<K extends string>(
  setStack: (s: K[]) => void,
  rootKey: K,
  resetKey?: string | number | null,
): void {
  useEffect(() => {
    setStack([rootKey]);
    // setStack 是 useState 返回的稳定 setter,不入依赖避免无限循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, rootKey]);
}

/** open 翻 false 时复位 stack,下次打开从根页开始(避免上次离开时的栈位残留)。 */
function useResetStackOnClose<K extends string>(
  setStack: (s: K[]) => void,
  rootKey: K,
  open: boolean,
): void {
  useEffect(() => {
    if (!open) setStack([rootKey]);
    // setStack 稳定不入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rootKey]);
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
  const { current, depth, push, back, reset } = useDrilldownStack(rootKey, open, resetKey);

  const nav: DrilldownNav<K> = useMemo(
    () => ({ push, back, reset, currentKey: current, depth }),
    [push, back, reset, current, depth],
  );

  const page = pages[current];
  if (!page) {
    // 防御:配置错误时不渲染,避免白屏
    return null;
  }
  const showBack = page.showBackButton ?? depth > 1;
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
      onBack={back}
      showCloseButton={showClose}
    >
      {page.render(nav)}
    </BaseDrawer>
  );
}
