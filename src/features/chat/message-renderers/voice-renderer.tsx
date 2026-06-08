import { useEffect, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { type Message } from "wukongimjssdk";
import { Pause, Play } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { endpointStore } from "@/features/base/stores/endpoint";
import { VoiceContent } from "@/features/base/im/voice-content";
import { useT } from "@/lib/i18n/use-t";

interface VoiceRendererProps {
  message: Message;
}

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "0″";
  if (sec < 60) return `${Math.round(sec)}″`;
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function resolveAudioUrl(url: string, baseURL: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  return `${baseURL}/${url.replace(/^\/+/, "")}`;
}

/**
 * 把 base64 波形字符串 decode 为 Uint8Array(对齐旧 VoiceCell line 127):
 *   atob → split → charCodeAt → Uint8Array。byte 0-255 表 amplitude。
 */
function decodeWaveform(base64: string): Uint8Array {
  if (!base64) return new Uint8Array(0);
  try {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  } catch {
    return new Uint8Array(0);
  }
}

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
 * 在 canvas 画波形 bar chart(对齐旧 dmworkbase Messages/Voice VoiceCell):
 * - waveform 是 Uint8Array,每 byte 0-255 amplitude
 * - 抽样到 ~40 bars,根据 canvas 宽度 fit
 * - 已播放 bar 用 active 色,未播放 bar 用 dim 色
 */
function useWaveformCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  waveform: Uint8Array,
  progress: number,
  activeColor: string,
  dimColor: string,
) {
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.clientWidth * dpr;
    const h = cvs.clientHeight * dpr;
    cvs.width = w;
    cvs.height = h;
    ctx.clearRect(0, 0, w, h);
    if (waveform.length === 0) return;
    const BAR_COUNT = Math.max(20, Math.min(60, Math.floor(w / (3 * dpr))));
    const step = waveform.length / BAR_COUNT;
    const barW = w / BAR_COUNT;
    const gap = barW * 0.4;
    const drawW = barW - gap;
    for (let i = 0; i < BAR_COUNT; i++) {
      // 桶内均值
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let sum = 0;
      for (let j = start; j < end; j++) sum += waveform[j];
      const avg = sum / Math.max(1, end - start) / 255; // 0-1
      const barH = Math.max(2, avg * h);
      const x = i * barW + gap / 2;
      const y = (h - barH) / 2;
      ctx.fillStyle = i / BAR_COUNT < progress ? activeColor : dimColor;
      ctx.fillRect(x, y, drawW, barH);
    }
  }, [canvasRef, waveform, progress, activeColor, dimColor]);
}

/**
 * 语音消息 renderer(对应旧 dmworkbase Messages/Voice VoiceCell):
 *
 *   [▶/⏸] ▁▃▅▇▆▄▂ {N}″
 *
 * - 浏览器原生 `<audio>` 播放;canvas 画后端给的 base64 waveform(每秒采样)
 * - 自己 / 别人不同色(brand vs elevated);波形已播放部分高亮 active 色
 * - audio.timeupdate 驱动 progress(0-1),触发 canvas 重画
 *
 * 不做(P3+):click 波形跳进度;多语音连播。
 */
export function VoiceRenderer({ message }: VoiceRendererProps) {
  const t = useT();
  const me = useStore(authStore, (s) => s.user?.uid ?? "");
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const isSelf = message.fromUID === me;
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const content = message.content as VoiceContent;
  const url = resolveAudioUrl(content.url || content.remoteUrl || "", baseURL);
  const duration = content.timeTrad || 0;
  const waveform = useMemoOnceWaveform(content.waveform);

  const audioRef = useAudioElement(url, () => {
    setPlaying(false);
    setProgress(0);
  });

  // 播放时 timeupdate 驱动 progress
  useTimeUpdate(audioRef, duration, setProgress);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeColor = isSelf ? "rgba(255,255,255,1)" : "rgb(var(--brand))";
  const dimColor = isSelf ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.2)";
  useWaveformCanvas(canvasRef, waveform, progress, activeColor, dimColor);

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

  const barWidth = Math.min(280, Math.max(120, duration * 10 + 80));

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
        aria-label={playing ? t("voiceRenderer.pause") : t("voiceRenderer.play")}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          isSelf ? "bg-white/20 hover:bg-white/30" : "bg-bg-surface hover:bg-bg-hover"
        }`}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      {waveform.length > 0 ? (
        <canvas ref={canvasRef} className="h-6 flex-1" />
      ) : (
        <span className="flex-1 truncate text-[12px]">{t("voiceRenderer.voice")}</span>
      )}
      <span className="shrink-0 text-[11px] tabular-nums opacity-80">
        {formatDuration(duration)}
      </span>
      <audio ref={audioRef} className="hidden" preload="metadata" />
    </div>
  );
}

/** 用 ref 缓存 decode 后的 Uint8Array,避免每次 render 重算(content 不变时引用稳定)。 */
function useMemoOnceWaveform(base64: string): Uint8Array {
  const ref = useRef<{ key: string; arr: Uint8Array }>({ key: "", arr: new Uint8Array(0) });
  if (ref.current.key !== base64) {
    ref.current = { key: base64, arr: decodeWaveform(base64) };
  }
  return ref.current.arr;
}

/** audio.timeupdate 监听 → setProgress(0-1)。 */
function useTimeUpdate(
  audioRef: React.RefObject<HTMLAudioElement | null>,
  duration: number,
  setProgress: (p: number) => void,
) {
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const handler = () => {
      if (duration > 0) setProgress(Math.min(1, el.currentTime / duration));
    };
    el.addEventListener("timeupdate", handler);
    return () => el.removeEventListener("timeupdate", handler);
  }, [audioRef, duration, setProgress]);
}
