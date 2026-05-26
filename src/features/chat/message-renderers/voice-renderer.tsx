import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { type Message } from "wukongimjssdk";
import { Pause, Play } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { endpointStore } from "@/features/base/stores/endpoint";
import { VoiceContent } from "@/features/base/im/voice-content";

interface VoiceRendererProps {
  message: Message;
}

/** 解析 mm:ss 显示串。 */
function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "0″";
  if (sec < 60) return `${Math.round(sec)}″`;
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/** url 是相对路径时拼 baseURL,否则 http(s) 直接用。 */
function resolveAudioUrl(url: string, baseURL: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  return `${baseURL}/${url.replace(/^\/+/, "")}`;
}

/** audio.play 是 promise — error 不阻塞 UI;ended/暂停切回非播放态由 onEnded 接管。 */
function useAudioElement(
  src: string,
  onEnded: () => void,
): React.RefObject<HTMLAudioElement | null> {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.src = src;
    el.preload = "metadata";
    const onEndHandler = () => onEnded();
    el.addEventListener("ended", onEndHandler);
    return () => el.removeEventListener("ended", onEndHandler);
  }, [src, onEnded]);
  return ref;
}

/**
 * 语音消息 renderer(对应旧 dmworkbase Messages/Voice VoiceCell,简化版):
 *
 *   [▶/⏸] ━━━━━━━━━━━━━━━ {N}″
 *
 * - 浏览器原生 `<audio>` 元素播放(webm/mp4 直接放;旧 amr 文件浏览器无法解 →
 *   直接播失败,降级显示 [语音] + 时长。后续可接 howler / ffmpeg.wasm 兜底)
 * - 自己消息:右对齐;别人消息:左对齐(MessageRow 外层已统一处理 isSelf 边距,
 *   这里不重复)
 *
 * 不做(P3+):波形可视化(waveform 字段)、播放进度条、多语音连播。
 */
export function VoiceRenderer({ message }: VoiceRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? "");
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const isSelf = message.fromUID === me;
  const [playing, setPlaying] = useState(false);

  const content = message.content as VoiceContent;
  const url = resolveAudioUrl(content.url || content.remoteUrl || "", baseURL);
  const duration = content.timeTrad || 0;

  const audioRef = useAudioElement(url, () => setPlaying(false));

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = audioRef.current;
    if (!el || !url) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    void el.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };

  // 宽度按时长粗略弹性:1″ ≈ 8px,clamp 80~240
  const barWidth = Math.min(240, Math.max(80, duration * 8 + 64));

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${
        isSelf ? "bg-brand text-white" : "bg-bg-elevated text-text-primary"
      }`}
      style={{ width: barWidth }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "暂停" : "播放"}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          isSelf ? "bg-white/20 hover:bg-white/30" : "bg-bg-surface hover:bg-bg-hover"
        }`}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <span className="flex-1 truncate text-[12px]">语音</span>
      <span className="shrink-0 text-[11px] tabular-nums opacity-80">
        {formatDuration(duration)}
      </span>
      <audio ref={audioRef} className="hidden" preload="metadata" />
    </div>
  );
}
