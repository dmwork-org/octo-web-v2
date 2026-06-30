import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Message, MessageStatus } from "wukongimjssdk";
import { Loader2, AlertCircle } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { message as toast } from "@/components/ui/message";
import { isConversationDisbanded } from "@/features/chat/lib/group-disband";
import { useT } from "@/lib/i18n/use-t";

interface MessageStatusBadgeProps {
  message: Message;
}

interface SdkTaskRuntime {
  id: string;
  progress: () => number;
}

interface SdkTaskManager {
  addListener: (listener: (task: SdkTaskRuntime) => void) => void;
  removeListener: (listener: (task: SdkTaskRuntime) => void) => void;
  taskMap?: Map<string, SdkTaskRuntime>;
}

function useUploadProgress(message: Message): number | null {
  const [progress, setProgress] = useState<number | null>(null);
  // task 任意更新(进度 / 失败 / 成功)都强制重渲,让外层读到最新的 message.status —
  // 上传失败时 upload-task.markFail() 翻 message.status=Fail(GH#135),徽章需及时
  // 从 spinner 切到「重发」。仅靠 setProgress 在进度值未变时会被 React bail-out。
  const [, force] = useState(0);
  useEffect(() => {
    const tm = (WKSDK.shared() as unknown as { taskManager?: SdkTaskManager }).taskManager;
    if (!tm) return;
    const listener = (task: SdkTaskRuntime) => {
      if (task?.id !== message.clientMsgNo) return;
      force((v) => v + 1);
      try {
        const p = task.progress();
        if (typeof p === "number") setProgress(p);
      } catch {
        /* progress() 可能 throw,忽略 */
      }
    };
    tm.addListener(listener);
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

export function MessageStatusBadge({ message }: MessageStatusBadgeProps) {
  const t = useT();
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const progress = useUploadProgress(message);

  if (!isSelf) return null;

  if (message.status === MessageStatus.Wait) {
    if (progress !== null && progress < 100) {
      return (
        <span
          aria-label={t("messageStatus.uploadingPercent", { values: { percent: progress } })}
          className="inline-flex shrink-0 items-center gap-1 text-brand"
        >
          <ProgressRing percent={progress} />
          <span className="text-[10px] font-medium tabular-nums">{progress}%</span>
        </span>
      );
    }
    return (
      <span
        aria-label={t("messageStatus.sending")}
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
            aria-label={t("messageStatus.resend")}
            onClick={() => {
              // 群解散后只读:拦截重发(target = 该消息所属频道)。
              if (isConversationDisbanded(message.channel)) {
                toast.warning(t("composer.disbandedNotice"));
                return;
              }
              void WKSDK.shared().chatManager.send(message.content, message.channel);
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-error hover:bg-error/10"
          >
            <AlertCircle size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t("messageStatus.sendFailed")}</TooltipContent>
      </Tooltip>
    );
  }
  return null;
}
