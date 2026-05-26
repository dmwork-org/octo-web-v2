import { Mic, Send, Trash2 } from "lucide-react";

interface VoiceRecordingBarProps {
  /** 当前录音秒数(整数) */
  duration: number;
  /** 上限,显示"还剩 N 秒" */
  maxDuration: number;
  onCancel: () => void;
  onSend: () => void;
}

/**
 * 录音中浮层(对应旧 VoiceInputIndicator + 旧 chattoolbar 录音状态条):
 *
 *   🎤 录音中 (mm:ss / 上限) ........... [🗑 取消] [▶ 发送]
 *
 * - 替换 Composer 主输入区显示,录音期间不能打字
 * - 取消 → 丢弃 blob,回到正常输入
 * - 发送 → stop 拿 file → 走 sendVoice
 */
export function VoiceRecordingBar({
  duration,
  maxDuration,
  onCancel,
  onSend,
}: VoiceRecordingBarProps) {
  const mm = Math.floor(duration / 60);
  const ss = duration % 60;
  const display = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const remain = Math.max(0, maxDuration - duration);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-error/30 bg-error/5 px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-error text-white">
        <Mic size={16} className="animate-pulse" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-medium text-error">录音中…</span>
        <span className="text-[11px] text-text-tertiary tabular-nums">
          {display} / 还剩 {remain} 秒
        </span>
      </div>
      <button
        type="button"
        onClick={onCancel}
        title="取消"
        className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-error"
      >
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        onClick={onSend}
        title="发送"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-white transition-opacity hover:opacity-90"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
