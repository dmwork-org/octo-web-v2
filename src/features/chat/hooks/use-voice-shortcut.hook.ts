import { useEffect, useRef } from "react";

/**
 * 全局语音快捷键(对齐旧 dmworkbase MessageInput VoiceInputIndicator):
 *
 *   - Shift + ⌘/Ctrl + Space:开始录音(同时按下三键)
 *   - 松开 Shift / Meta / Ctrl 任一 → 停录 + 转写
 *   - Esc(录音中):取消(丢弃 blob,不转写)
 *
 * 长按左 Shift 500ms 进录音(旧版还有这条)— P3+ 再补,需要做防误触
 * (Shift+ 大写字母 / IME 切换 等场景需要不被触发)。
 *
 * 实现细节:
 *   - effect 只挂一次(empty deps),内部通过 ref 读最新 state / handler,
 *     避免每次 state 变更重订阅 keydown/keyup
 *   - keyup 监听 window 而非 input,因为录音中用户可能 blur 输入框
 */
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
    const onKeyDown = (e: KeyboardEvent) => {
      const { isRecording: rec, isTranscribing: tr } = stateRef.current;
      const h = handlersRef.current;
      // Esc 取消(仅录音中)
      if (e.code === "Escape" && rec) {
        e.preventDefault();
        h.cancel();
        return;
      }
      // Shift + ⌘/Ctrl + Space 开始录音
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.code === "Space") {
        if (!rec && !tr) {
          e.preventDefault();
          h.start();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!stateRef.current.isRecording) return;
      // 松开 Shift / Meta / Ctrl 任一 → 停录 + 转写
      if (e.key === "Shift" || e.key === "Meta" || e.key === "Control") {
        e.preventDefault();
        handlersRef.current.stopAndTranscribe();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
