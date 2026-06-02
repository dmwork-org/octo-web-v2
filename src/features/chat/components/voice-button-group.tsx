import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Mic } from "lucide-react";
import type { VoiceMode } from "@/features/base/api/endpoints/voice.api";

interface VoiceButtonGroupProps {
  /** 当前状态(决定渲染哪种 UI / 是否可点) */
  state: "idle" | "preparing" | "recording" | "transcribing";
  /** mic 按钮点击 — 由 composer 决定:idle 时启 append_only;recording 时停录 */
  onMicClick: () => void;
  /** 模式下拉选中(语音输入 / 语音编辑) */
  onModeSelect: (mode: VoiceMode) => void;
  /** 录音 / 转写时 disabled,只能停 / 等 */
  modeMenuDisabled: boolean;
  /** mic 按钮 tooltip */
  micTitle: string;
}

interface ModeOption {
  value: VoiceMode;
  label: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { value: "append_only", label: "语音输入" },
  { value: "edit_only", label: "语音编辑" },
];

/** hover 触发的下拉(命名 hook:监听 wrapper hover 进出),delay 关闭防抖。 */
function useHoverDropdown(): {
  open: boolean;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  close: () => void;
} {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  return {
    open,
    wrapperRef,
    onMouseEnter: () => {
      clearTimer();
      setOpen(true);
    },
    onMouseLeave: () => {
      clearTimer();
      closeTimerRef.current = setTimeout(() => setOpen(false), 100);
    },
    close: () => {
      clearTimer();
      setOpen(false);
    },
  };
}

/**
 * Mic icon + 向下小三角(对齐旧 wk-voice-button--recording 内部:Mic 18 + svg 6×4 三角)。
 * 默认态和录音/转写态视觉一致,只是配色变化 + cursor 变 pointer。
 */
function MicWithArrow({ size = 18 }: { size?: number }) {
  return (
    <>
      <Mic size={size} />
      <svg width="6" height="4" viewBox="0 0 6 4" fill="currentColor">
        <path d="M0.5 0.5L3 3.5L5.5 0.5H0.5Z" />
      </svg>
    </>
  );
}

/**
 * Mic 按钮组(1:1 对齐旧 dmworkbase MessageInput VoiceInputIndicator):
 *
 *   ┌──────── wrapper(hover 弹下拉) ────────┐
 *   │  🎤  ▼                                │
 *   └────────────────────────────────────────┘
 *
 * 行为:
 * - idle:点 🎤 直接 append_only 启录;hover wrapper 弹下拉,点 [语音输入]/[语音编辑] 启指定 mode
 * - preparing:Mic + opacity 60 + pulse(getUserMedia 等权限期间)
 * - recording:整个按钮区可点 → 停录+转写;**只显 Mic + 向下三角(无时长)**;
 *   配色变红 + cursor pointer;时长 / 模式提示在 floating indicator(卡片上方浮窗)
 * - transcribing:同 recording 形态 + disabled,等浮窗 spinner 跑完
 */
export function VoiceButtonGroup({
  state,
  onMicClick,
  onModeSelect,
  modeMenuDisabled,
  micTitle,
}: VoiceButtonGroupProps) {
  const { open, wrapperRef, onMouseEnter, onMouseLeave, close } = useHoverDropdown();
  const showMenu = open && state === "idle" && !modeMenuDisabled;
  const wrapperActive = state === "recording" || state === "transcribing";

  const onPickMode = (mode: VoiceMode) => {
    close();
    onModeSelect(mode);
  };

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={state === "idle" ? onMouseEnter : undefined}
      onMouseLeave={state === "idle" ? onMouseLeave : undefined}
      className="relative flex h-6 items-center"
    >
      <button
        type="button"
        onClick={onMicClick}
        aria-label="语音输入"
        title={micTitle}
        disabled={state === "transcribing" || state === "preparing"}
        className={`flex h-6 items-center justify-center gap-0.5 rounded px-1 transition-colors disabled:cursor-not-allowed ${
          state === "recording" || state === "transcribing"
            ? "bg-brand/[0.06] text-brand"
            : state === "preparing"
              ? "text-brand opacity-60"
              : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        }`}
      >
        {state === "transcribing" ? (
          <Loader2 size={20} className="animate-spin" />
        ) : state === "preparing" ? (
          <Mic size={20} className="animate-pulse" />
        ) : state === "recording" ? (
          <MicWithArrow size={20} />
        ) : (
          <Mic size={20} />
        )}
      </button>
      <button
        type="button"
        aria-label="语音模式"
        title="语音模式"
        disabled={modeMenuDisabled || wrapperActive}
        className={`flex h-6 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          showMenu ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
        }`}
        onClick={() => {
          if (state !== "idle" || modeMenuDisabled) return;
          if (!open) onMouseEnter();
          else close();
        }}
      >
        <ChevronDown size={14} className={`transition-transform ${showMenu ? "rotate-180" : ""}`} />
      </button>

      {showMenu ? (
        <ul
          role="menu"
          className="absolute right-0 bottom-full z-30 mb-1 w-[120px] overflow-hidden rounded-md border border-border-default bg-bg-surface py-1 shadow-lg"
        >
          {MODE_OPTIONS.map((opt) => (
            <li key={opt.value} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => onPickMode(opt.value)}
                className="block w-full px-3 py-1.5 text-left text-sm text-text-primary transition-colors hover:bg-bg-hover"
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
