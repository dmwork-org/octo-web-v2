import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Channel, Message } from "wukongimjssdk";
import { CheckSquare, Layers, ListPlus, Share, Trash2, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { deleteMessages as deleteMessagesApi } from "@/features/base/api/endpoints/message.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";

interface SelectionToolbarProps {
  channel: Channel;
}

type ForwardMode = "per" | "merge";

/**
 * 多选模式底部浮层(对应截图设计):
 *
 *   ╭─────────────────────────────────────────────────────────╮
 *   │ 逐条转发  合并转发  创建新事项  同步到事项  删除  ✕  │
 *   ╰─────────────────────────────────────────────────────────╯
 *
 * - fixed bottom 居中,白底胶囊 + shadow
 * - 5 个 action + 1 个关闭 ✕
 * - "创建新事项 / 同步到事项":跨 matter 模块,P3+ 接入 — 本期 console + toast 占位
 * - 转发拆 "逐条 / 合并" 两按钮各自打开 ForwardModal(传 defaultMode)
 *
 * 替代 Composer 显示(在 chat-main 内 isSelectionMode 切换)。
 */
export function SelectionToolbar({ channel }: SelectionToolbarProps) {
  const qc = useQueryClient();
  const ids = useStore(chatSelectionStore, (s) => s.ids);
  const count = ids.size;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [forwardMode, setForwardMode] = useState<ForwardMode>("per");

  const findMessages = (): Message[] => {
    const data = qc.getQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      messagesQueryKey(channel.channelID, channel.channelType),
    );
    if (!data) return [];
    const all = data.pages.flat();
    return all.filter((m) => ids.has(m.clientMsgNo));
  };

  const removeFromCache = (msgs: Message[]) => {
    const set = new Set(msgs.map((m) => m.clientMsgNo));
    qc.setQueriesData<{ pages: Message[][]; pageParams: unknown[] }>(
      { queryKey: messagesQueryKey(channel.channelID, channel.channelType) },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => p.filter((m) => !set.has(m.clientMsgNo))),
        };
      },
    );
  };

  const deleteMu = useMutation({
    mutationFn: async () => {
      const msgs = findMessages();
      await deleteMessagesApi(
        msgs.map((m) => ({
          message_id: m.messageID,
          channel_id: m.channel.channelID,
          channel_type: m.channel.channelType,
          message_seq: m.messageSeq,
        })),
      );
      return msgs;
    },
    onSuccess: (msgs) => {
      removeFromCache(msgs);
      toast.success(`已删除 ${msgs.length} 条`);
      setConfirmDelete(false);
      chatSelectionActions.exit();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  const openForward = (mode: ForwardMode) => {
    const msgs = findMessages();
    if (msgs.length === 0) return;
    setForwardMode(mode);
    setForwardMessages(msgs);
  };

  /** 创建新事项(matter completion 阶段接入 — 本期 console + toast P3+)。 */
  const onCreateMatter = () => {
    const msgs = findMessages();
    // eslint-disable-next-line no-console
    console.log("[chat] 创建新事项 click(P3+ 跨 matter feature)", { count: msgs.length, msgs });
    toast.info("创建新事项即将接入(matter completion)");
  };

  /** 同步到事项(matter completion 阶段接入)。 */
  const onSyncMatter = () => {
    const msgs = findMessages();
    // eslint-disable-next-line no-console
    console.log("[chat] 同步到事项 click(P3+ 跨 matter feature)", { count: msgs.length, msgs });
    toast.info("同步到事项即将接入(matter completion)");
  };

  const baseBtn =
    "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      {/* fixed 浮层 — 居中下方,跟 message-list 容器无关 */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border-subtle bg-bg-surface px-2 py-1.5 shadow-lg">
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("per")}
            className={`${baseBtn} text-text-primary hover:bg-bg-hover`}
          >
            <Share size={14} />
            逐条转发
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("merge")}
            className={`${baseBtn} text-text-primary hover:bg-bg-hover`}
          >
            <Layers size={14} />
            合并转发
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={onCreateMatter}
            className={`${baseBtn} text-text-primary hover:bg-bg-hover`}
          >
            <CheckSquare size={14} />
            创建新事项
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={onSyncMatter}
            className={`${baseBtn} text-text-primary hover:bg-bg-hover`}
          >
            <ListPlus size={14} />
            同步到事项
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirmDelete(true)}
            className={`${baseBtn} text-error hover:bg-error/10`}
          >
            <Trash2 size={14} />
            删除
          </button>
          <span className="mx-0.5 h-5 w-px bg-border-default" />
          <button
            type="button"
            aria-label="退出多选"
            title="退出多选"
            onClick={() => chatSelectionActions.exit()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        content={`确定删除选中的 ${count} 条消息?该操作不可恢复。`}
        okDanger
        okText="删除"
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ForwardModal
        open={forwardMessages.length > 0}
        messages={forwardMessages}
        defaultMode={forwardMode}
        onClose={() => {
          setForwardMessages([]);
          chatSelectionActions.exit();
        }}
      />
    </>
  );
}
