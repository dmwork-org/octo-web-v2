import { useEffect, useRef } from "react";

/**
 * 全局语音快捷键(1:1 对齐旧 dmworkbase MessageInput VoiceInputIndicator):
 *
 * 两条启录路径:
 *   1. **Shift + ⌘/Ctrl + Space**:同时按下三键启录;松开任一 modifier 停录+转写
 *   2. **长按 ShiftLeft 500ms**:启录(纯键路径,适合 hands-on-keyboard 用户);
 *      期间按其它非 IME 键 → cancel timer(防 Shift+ 字母误触);
 *      松开:timer 未触发 → 取消;已启录 → 停录+转写
 *
 * 任意路径录音中按 Esc → 取消(丢 blob)。
 *
 * 实现细节:
 *   - effect 只挂一次(empty deps),内部通过 ref 读最新 state / handler
 *   - keyup 监听 window 而非 input(录音中用户可能 blur 输入框)
 *   - shiftRecordingRef 区分本次录音是 long-press 还是 Shift+Cmd+Space 路径,
 *     避免 Shift 松开误停 long-press 之外的录音
 */

/** ShiftLeft 长按多少 ms 进入实际启录(对齐旧 RECORDING_DELAY_MS=500)。 */
const RECORDING_DELAY_MS = 500;

export function useVoiceShortcut(
  isRecording: boolean,
  isTranscribing: boolean,
  start: () => void,
  stopAndTranscribe: () => void,
  cancel: () => void,
): void {
  const stateRef = useRef({ isRecording, isTranscribing });
  stateRef.current = { isRecording, isTranscribing };
  const handlersRef = useRef({ start, stopAndTranscribe, cancel });
  handlersRef.current = { start, stopAndTranscribe, cancel };

  useEffect(() => {
    // 长按 ShiftLeft 的 timer / flag
    let shiftLongPressTimer: ReturnType<typeof setTimeout> | null = null;
    let shiftRecording = false; // 本次录音是否由 long-press ShiftLeft 触发

    const clearShiftLongPress = () => {
      if (shiftLongPressTimer !== null) {
        clearTimeout(shiftLongPressTimer);
        shiftLongPressTimer = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { isRecording: rec, isTranscribing: tr } = stateRef.current;
      const h = handlersRef.current;

      // Esc 取消(仅录音中)
      if (e.code === "Escape" && rec) {
        e.preventDefault();
        clearShiftLongPress();
        shiftRecording = false;
        h.cancel();
        return;
      }

      // Shift + ⌘/Ctrl + Space 启录(同时按)
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.code === "Space") {
        if (!rec && !tr) {
          e.preventDefault();
          shiftRecording = false; // 区分:不是 long-press 路径
          h.start();
        }
        return;
      }

      // 长按 ShiftLeft(无 modifier、no-repeat)启 500ms timer
      if (e.code === "ShiftLeft" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (!rec && !tr && shiftLongPressTimer === null) {
          shiftLongPressTimer = setTimeout(() => {
            shiftLongPressTimer = null;
            const cur = stateRef.current;
            if (cur.isRecording || cur.isTranscribing) return;
            shiftRecording = true;
            handlersRef.current.start();
          }, RECORDING_DELAY_MS);
        }
        return;
      }

      // ShiftLeft 等待期间:任何其它非 IME 键 → cancel(防 Shift+ 字母 / Shift+Tab 误触)
      if (shiftLongPressTimer !== null) {
        if (e.code.startsWith("Control") || e.code.startsWith("Alt") || e.code.startsWith("Meta")) {
          clearShiftLongPress();
          return;
        }
        const isIME =
          e.code.startsWith("Shift") ||
          e.key === "Process" ||
          e.key === "Unidentified" ||
          e.isComposing;
        if (!isIME) clearShiftLongPress();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const { isRecording: rec } = stateRef.current;
      const h = handlersRef.current;

      // ShiftLeft 松开
      if (e.code === "ShiftLeft") {
        // ① timer 未触发 → 取消(普通 Shift 短按)
        if (shiftLongPressTimer !== null) {
          clearShiftLongPress();
          return;
        }
        // ② long-press 已启录 → 停录 + 转写
        if (shiftRecording && rec) {
          shiftRecording = false;
          e.preventDefault();
          h.stopAndTranscribe();
          return;
        }
        // long-press 已发出 start 但 getUserMedia 还没回 → 标记 cancel pending
        if (shiftRecording && !rec) {
          shiftRecording = false;
          h.cancel();
          return;
        }
      }

      if (!rec) return;

      // Shift+Cmd/Ctrl+Space 路径:松开任一 modifier 停录(long-press 已上面处理过)
      if (e.key === "Shift" || e.key === "Meta" || e.key === "Control") {
        if (shiftRecording) return;
        e.preventDefault();
        h.stopAndTranscribe();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      clearShiftLongPress();
    };
  }, []);
}
