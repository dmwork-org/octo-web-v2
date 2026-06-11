/**
 * 根据触发按钮的 rect 算 AnchorPopover 锚定位置 (对齐原型 v19 onShowAnchor)。
 * 水平:左对齐按钮,防止弹框太靠右。
 * 垂直:优先按钮下方 8px;下方空间不足时贴按钮上方。
 */
export function computeAnchorPosition(rect: DOMRect): {
  x: number;
  top?: number;
  bottom?: number;
} {
  const popWidth = 424;
  const popMinHeight = 120;
  const safe = 16;
  const gap = 8;

  const x = Math.max(safe, Math.min(rect.left, window.innerWidth - popWidth - safe));

  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  if (spaceBelow >= popMinHeight + gap) {
    return { x, top: rect.bottom + gap };
  }
  if (spaceAbove >= popMinHeight + gap) {
    return { x, bottom: window.innerHeight - rect.top + gap };
  }
  return { x, top: safe };
}
