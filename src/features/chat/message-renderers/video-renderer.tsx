import { useState } from "react";
import { useStore } from "@tanstack/react-store";
import { type Message } from "wukongimjssdk";
import { Play } from "lucide-react";
import { endpointStore } from "@/features/base/stores/endpoint";
import { VideoContent } from "@/features/base/im/video-content";

interface VideoRendererProps {
  message: Message;
}

function resolveUrl(url: string, baseURL: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:"))
    return url;
  return `${baseURL}/${url.replace(/^\/+/, "")}`;
}

function videoScale(
  orgW: number,
  orgH: number,
  maxW = 240,
  maxH = 320,
): { width: number; height: number } {
  if (!orgW || !orgH) return { width: maxW, height: 180 };
  const wr = maxW / orgW;
  const hr = maxH / orgH;
  const r = Math.min(wr, hr, 1);
  return { width: Math.round(orgW * r), height: Math.round(orgH * r) };
}

function formatDur(sec: number): string {
  if (!sec || sec < 0) return "0:00";
  const mm = Math.floor(sec / 60);
  const ss = Math.round(sec % 60);
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * 小视频渲染(对应旧 dmworkbase Messages/Video VideoCell):
 *
 *   ┌──────────────┐
 *   │              │  ← 封面图(cover),没封面用 video tag 自带 poster
 *   │      ▶       │  ← 居中播放图标,点击切换到 inline <video> 播放
 *   │              │
 *   │ 0:23         │  ← 时长右下角
 *   └──────────────┘
 *
 * 简化:
 * - 不做 dialog 全屏播放,inline `<video controls>` 即可
 * - 不做画中画 / 倍速 / 字幕(P3+)
 * - 上传中(无 url 但有 file)显示封面 + 进度环 — 走 MessageStatusBadge 已有的
 *   useUploadProgress hook,不在 renderer 里重复
 */
export function VideoRenderer({ message }: VideoRendererProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const [playing, setPlaying] = useState(false);
  const content = message.content as VideoContent;
  const url = resolveUrl(content.url || content.remoteUrl || "", baseURL);
  const cover = resolveUrl(content.cover, baseURL);
  const { width, height } = videoScale(content.width, content.height);

  if (!url && !cover) {
    return (
      <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
        [小视频]
      </span>
    );
  }

  if (playing && url) {
    return (
      <video
        src={url}
        controls
        autoPlay
        poster={cover || undefined}
        style={{ width, height }}
        className="rounded-md bg-black"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => url && setPlaying(true)}
      style={{ width, height }}
      className="group relative overflow-hidden rounded-md bg-bg-elevated"
      aria-label="播放视频"
    >
      {cover ? (
        <img
          src={cover}
          alt="视频封面"
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black/60 text-text-inverse">
          [小视频]
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white">
          <Play size={24} fill="white" />
        </span>
      </div>
      {content.second > 0 ? (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white tabular-nums">
          {formatDur(content.second)}
        </span>
      ) : null}
    </button>
  );
}
