/**
 * Typing 消息(contentType=-2)— "正在输入"占位(1:1 对齐旧 dmworkbase
 * Messages/Typing/index.tsx 的 BeatLoader):
 *
 *   3 个深灰色圆点 8px 直径 / 4px 间距 / 18px 容器高,依次跳动
 *
 * **不引** `react-spinners` — 纯 CSS keyframes 等效,体积小。
 * **不显示文本内容** — typing 消息没有 text 字段,只是状态指示。
 * **头像 + sender header** 由 MessageRow 走默认完整渲染流程(typing contentType=-2
 * 不在 system 范围 1000-2000 内,shouldRenderBare → false → 完整 MessageRow)。
 *
 * 颜色 #1c1c23(对齐旧 `var(--wk-color-theme)`);自身 keyframes 内联在 <style> tag,
 * 不污染全局 CSS。
 */
export function TypingRenderer() {
  return (
    <div className="flex h-[18px] items-center gap-1">
      <style>{TYPING_KEYFRAMES}</style>
      <span className="wk-typing-dot" />
      <span className="wk-typing-dot" />
      <span className="wk-typing-dot" />
    </div>
  );
}

const TYPING_KEYFRAMES = `
.wk-typing-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #1c1c23;
  opacity: 0.4;
  animation: wk-typing-bounce 1s infinite ease-in-out both;
}
.wk-typing-dot:nth-child(1) { animation-delay: -0.32s; }
.wk-typing-dot:nth-child(2) { animation-delay: -0.16s; }
.wk-typing-dot:nth-child(3) { animation-delay: 0s; }

@keyframes wk-typing-bounce {
  0%, 80%, 100% { opacity: 0.4; transform: scale(1); }
  40% { opacity: 1; transform: scale(1.15); }
}
`;
