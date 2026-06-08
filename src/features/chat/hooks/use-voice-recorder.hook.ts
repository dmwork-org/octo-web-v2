import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n/instance";

/**
 * 语音录音 hook(对应旧 dmworkbase Components/MessageInput/useVoiceInput,简化版):
 *
 * - 旧版有 voice-to-text 转写模式 + amr 编码 + 后端 voice config;新版仅做"录音 → 文件"
 *   闭环,后端识别格式由上层处理;转写功能 P3+ 再补。
 * - MIME:webm/opus 优先(Chrome / Firefox / Edge),fallback mp4(Safari);
 *   两者 howler / `<audio>` 都能直接播。
 *
 * 状态机:idle → recording → idle / cancelled。
 *   - start():请求麦克风权限 → MediaRecorder 启动 → 计时 setInterval
 *   - stop():停止录音 + 关麦克风 stream + 等 onstop 拿 blob → 返回 File
 *   - cancel():同 stop 但丢弃 blob,返回 null
 *
 * 时长上限默认 60s(对齐旧 PRD),到点自动 stop 并触发 onAutoStop。
 */
export interface UseVoiceRecorderOptions {
  maxDuration?: number;
  onError?: (error: Error) => void;
  /** 自动到时停录(到时只 stop,不发送 — 由上层 sendBar 决定要不要发) */
  onAutoStop?: () => void;
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  /** 当前录音时长(秒,整数) */
  duration: number;
  start: () => Promise<void>;
  /** 停止录音并 resolve 文件;cancel=true 时丢弃返回 null。 */
  stop: (cancel?: boolean) => Promise<File | null>;
}

function getSupportedMimeType(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return { mime: "audio/webm;codecs=opus", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return { mime: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return { mime: "audio/mp4", ext: "m4a" };
  }
  return { mime: "", ext: "webm" };
}

/** 计时 setInterval 1s 写 duration,组件 unmount 自动清理。 */
function useTickTimer(running: boolean, onTick: () => void) {
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(onTick, 1000);
    return () => window.clearInterval(id);
  }, [running, onTick]);
}

export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const { maxDuration = 60, onError, onAutoStop } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef(0);
  const cancelledRef = useRef(false);
  const stopResolverRef = useRef<((file: File | null) => void) | null>(null);

  const stop = useCallback(
    (cancel = false): Promise<File | null> => {
      const rec = recorderRef.current;
      if (!rec || rec.state === "inactive") {
        return Promise.resolve(null);
      }
      cancelledRef.current = cancel;
      return new Promise<File | null>((resolve) => {
        stopResolverRef.current = resolve;
        try {
          rec.stop();
        } catch (e) {
          resolve(null);
          if (e instanceof Error && onError) onError(e);
        }
      });
    },
    [onError],
  );

  const handleTick = useCallback(() => {
    const elapsedMs = Date.now() - startTimeRef.current;
    const sec = Math.floor(elapsedMs / 1000);
    setDuration(sec);
    if (sec >= maxDuration) {
      // 仅通知 — 父组件决定怎么停(可能要拿 file 转写)。父组件不响应时不会无限录,
      // 因为 sec 一直递增,但 setDuration 触发频率仍是 1s 一次,影响有限。
      onAutoStop?.();
    }
  }, [maxDuration, onAutoStop]);

  useTickTimer(isRecording, handleTick);

  const start = useCallback(async () => {
    if (isRecording) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.(new Error(t("voiceRecorder.browserUnsupported")));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime } = getSupportedMimeType();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const tracks = streamRef.current?.getTracks() ?? [];
        for (const track of tracks) track.stop();
        streamRef.current = null;
        setIsRecording(false);

        const resolver = stopResolverRef.current;
        stopResolverRef.current = null;
        if (cancelledRef.current) {
          chunksRef.current = [];
          resolver?.(null);
          return;
        }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        const ext = (rec.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        resolver?.(file);
      };
      startTimeRef.current = Date.now();
      setDuration(0);
      setIsRecording(true);
      rec.start();
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  }, [isRecording, onError]);

  return { isRecording, duration, start, stop };
}
