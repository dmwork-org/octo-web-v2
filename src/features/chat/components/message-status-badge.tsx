import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Message, MessageStatus } from "wukongimjssdk";
import { Loader2, AlertCircle } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MessageStatusBadgeProps {
  message: Message;
}

/**
 * SDK MessageTask 的 runtime 形态(taskMap 不在 d.ts 上暴露)。
 * `progress` 是函数;`id === message.clientMsgNo`。
 */
interface SdkTaskRuntime {
  id: string;
  progress: () => number;
}

interface SdkTaskManager {
  addListener: (listener: (task: SdkTaskRuntime) => void) => void;
  removeListener: (listener: (task: SdkTaskRuntime) => void) => void;
  taskMap?: Map<string, SdkTaskRuntime>;
}

/**
 * 订阅 SDK taskManager,把当前消息(clientMsgNo)对应上传任务的进度暴露给 UI。
 *
 * - 仅当 message 是 media(图片/文件等,有 task)时拿到非 null 值;否则 null
 * - SDK 内部 task.update() 触发 listener,每 ~10% 重渲一次(XHR upload progress)
 * - 离开时移除 listener;clientMsgNo 变化(切换不同消息行)时重订阅
 *
 * 旧 dmworkbase ImageCell/FileCell/VideoCell 同款思路,这里做成共享 hook。
 */
function useUploadProgress(message: Message): number | null {
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => {
    const tm = (WKSDK.shared() as unknown as { taskManager?: SdkTaskManager }).taskManager;
    if (!tm) return;
    const listener = (task: SdkTaskRuntime) => {
      if (task?.id !== message.clientMsgNo) return;
      try {
        const p = task.progress();
        if (typeof p === "number") setProgress(p);
      } catch {
        /* progress() 可能 throw,忽略 */
      }
    };
    tm.addListener(listener);
    // 订阅前已有 task → 取一次当前进度
    const existing = tm.taskMap?.get(message.clientMsgNo);
    if (existing) {
      try {
        const p = existing.progress();
        if (typeof p === "number") setProgress(p);
      } catch {
        /* ignore */
      }
    }
    return () => tm.removeListener(listener);
  }, [message.clientMsgNo]);
  return progress;
}

/** 圆环进度图(SVG):0-100,active 弧用 brand 色,inactive 用 border-default。 */
function ProgressRing({ percent }: { percent: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-label={`${percent}%`}>
      <circle cx="8" cy="8" r={r} stroke="currentColor" strokeWidth="2" fill="none" opacity={0.2} />
      <circle
        cx="8"
        cy="8"
        r={r}
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

/**
 * 自己发出消息的状态指示:
 *   Wait + media + 进度可读 → 进度环
 *   Wait + 其他 → spinner
 *   Fail → 红 ! 点击重发
 *   Normal → 不渲染
 *
 * 他人消息也不渲染。
 */
export function MessageStatusBadge({ message }: MessageStatusBadgeProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const progress = useUploadProgress(message);

  if (!isSelf) return null;

  if (message.status === MessageStatus.Wait) {
    if (progress !== null && progress < 100) {
      return (
        <span
          aria-label={`上传中 ${progress}%`}
          className="inline-flex shrink-0 items-center gap-1 text-brand"
        >
          <ProgressRing percent={progress} />
          <span className="text-[10px] font-medium tabular-nums">{progress}%</span>
        </span>
      );
    }
    return (
      <span
        aria-label="发送中"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary"
      >
        <Loader2 size={14} className="animate-spin" />
      </span>
    );
  }
  if (message.status === MessageStatus.Fail) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="重新发送"
            onClick={() => {
              void WKSDK.shared().chatManager.send(message.content, message.channel);
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-error hover:bg-error/10"
          >
            <AlertCircle size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>发送失败,点击重发</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}
