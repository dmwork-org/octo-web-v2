import { useEffect, useRef, useState } from "react";
import { Channel } from "wukongimjssdk";
import { ExternalLink, MoreHorizontal, Unlink } from "lucide-react";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";

interface ChannelMoreMenuProps {
  channelId: string;
  channelType: number;
  onUnlink: () => void;
}

/** 点击元素外部时关闭的 hook */
function useClickOutside(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  return ref;
}

/**
 * ⋮ 下拉菜单（常驻可见，非 hover 显现）。
 *
 * - "查看群聊": 跳转到对应对话
 * - "取消关联": 触发 onUnlink 回调
 */
export function ChannelMoreMenu({ channelId, channelType, onUnlink }: ChannelMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, setOpen);

  const handleViewChannel = () => {
    setOpen(false);
    chatSelectedActions.select(new Channel(channelId, channelType));
  };

  return (
    <span ref={ref} className="relative ml-auto shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-6 w-6 items-center justify-center rounded text-text-tertiary transition-colors hover:text-text-primary hover:bg-bg-hover"
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div className="absolute top-7 right-0 z-10 flex w-36 flex-col rounded-md border border-border-subtle bg-bg-surface py-1 shadow-lg">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary transition-colors hover:bg-bg-hover"
            onClick={handleViewChannel}
          >
            <ExternalLink size={11} />
            查看群聊
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-error transition-colors hover:bg-error/10"
            onClick={() => {
              setOpen(false);
              onUnlink();
            }}
          >
            <Unlink size={11} />
            取消关联
          </button>
        </div>
      ) : null}
    </span>
  );
}
