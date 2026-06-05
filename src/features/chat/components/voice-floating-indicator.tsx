import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface VoiceFloatingIndicatorProps {
  /** 浮窗形态:recording=波纹动画;transcribing=spinner */
  state: "recording" | "transcribing";
  /** 模式文案(左侧),录音中:"语音输入"/"语音编辑";转写中:"转写中"/"编辑中" */
  label: string;
  /** 浮窗锚点(composer form 容器);浮窗显示在其上方 20px 间隙 */
  anchorRef: React.RefObject<HTMLElement | null>;
}

/** 16 bar 双向对称波纹延迟(对齐旧 voiceInput.css nth-child)。 */
const WAVE_DELAYS = [
  "0s",
  "0.1s",
  "0.2s",
  "0.3s",
  "0.4s",
  "0.5s",
  "0.6s",
  "0.7s",
  "0.6s",
  "0.5s",
  "0.4s",
  "0.3s",
  "0.2s",
  "0.1s",
  "0s",
  "0.1s",
];

/** wave / spin keyframes;inline 注入,避免全局 CSS 改动。 */
const STYLE = `
@keyframes wk-voice-wave {
  0%, 100% { height: 6px; }
  50% { height: 20px; }
}
@keyframes wk-voice-spin {
  to { transform: rotate(360deg); }
}
.wk-voice-wave-bar {
  width: 3px;
  background-color: rgb(124, 92, 252);
  border-radius: 1.5px;
  animation: wk-voice-wave 0.8s ease-in-out infinite;
}
.wk-voice-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(124, 92, 252, 0.18);
  border-top-color: rgb(124, 92, 252);
  border-radius: 50%;
  animation: wk-voice-spin 0.6s linear infinite;
}
`;

/** anchor 位置计算(top=card top - 20gap - 48height,left=card 中线)— 命名 hook。 */
function useAnchorPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({ top: rect.top - 20 - 48, left: rect.left + rect.width / 2 });
    };
    update();
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        update();
        raf = null;
      });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", onScroll, true);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [anchorRef]);
  return pos;
}

/**
 * 录音/转写时浮在 composer form 上方的胶囊指示器(对齐旧 VoiceInputIndicator):
 *
 *   ┌──────────────────────────────────────┐
 *   │ 语音输入 │ 16 bar 波纹动画 (recording)│
 *   └──────────────────────────────────────┘
 *   ┌──────────────────────────────────────┐
 *   │ 转写中   │   spinner    (transcribing)│
 *   └──────────────────────────────────────┘
 *
 * 184×48 圆角胶囊 + brand 阴影,position: fixed portal 到 body,
 * 通过 anchorRef.getBoundingClientRect() 算 top/left。
 */
export function VoiceFloatingIndicator({ state, label, anchorRef }: VoiceFloatingIndicatorProps) {
  const pos = useAnchorPosition(anchorRef);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <>
      <style>{STYLE}</style>
      <div
        className="z-floating"
        style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          transform: "translateX(-50%)",
          width: 184,
          height: 48,
          padding: "4px 16px",
          background: "var(--color-bg-surface, #fff)",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 1000,
          boxShadow: "0px 0px 20px 0px rgba(0,0,0,0.08)",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: "22px",
            color: "var(--color-text-primary, #1c1c23)",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <span
          style={{
            width: 1,
            height: 20,
            margin: "0 8px",
            background: "rgba(0,0,0,0.1)",
            flexShrink: 0,
          }}
        />
        {state === "recording" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: 80,
              height: 24,
              gap: 2,
            }}
          >
            {WAVE_DELAYS.map((delay, i) => (
              <span key={i} className="wk-voice-wave-bar" style={{ animationDelay: delay }} />
            ))}
          </div>
        ) : (
          <div
            style={{
              width: 80,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span className="wk-voice-spinner" />
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
