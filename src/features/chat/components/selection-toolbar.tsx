import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Channel, Message } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { SmartCreateModal } from "@/features/matter/components/smart-create-modal";
import { deleteMessages as deleteMessagesApi } from "@/features/base/api/endpoints/message.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";

interface SelectionToolbarProps {
  channel: Channel;
}

type ForwardMode = "per" | "merge";

/**
 * 多选模式底部浮层(对齐旧 dmworkbase Conversation.MultiplePanel + .wk-multiplepanel CSS):
 *
 *   ╭ 逐条转发 | 合并转发 | 创建新事项 | 同步到事项 | 删除 | ✕ ╮
 *
 * - 容器:#fff + radius 1000px + shadow + gap 12px + padding 4px 16px
 * - 按钮:32px 高,padding 6px 16px,radius 100px,14px / 500 / #1c1c23,
 *   hover bg rgba(28,28,35,0.08);删除按钮 color #FF563B / hover bg
 *   rgba(255,86,59,0.08)
 * - 分隔条:1px × 20px,bg rgba(28,28,35,0.15),每按钮间
 * - 关闭 ✕:28×28 radius 100px,muted color,hover bg
 *
 * "创建新事项 / 同步到事项":跨 matter,P3+ 接入 — 本期 console + toast 占位。
 * 转发拆 "逐条 / 合并" 两按钮各自打开 ForwardModal(传 defaultMode)。
 */
export function SelectionToolbar({ channel }: SelectionToolbarProps) {
  const qc = useQueryClient();
  const ids = useStore(chatSelectionStore, (s) => s.ids);
  const count = ids.size;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [smartCreateMessages, setSmartCreateMessages] = useState<Message[]>([]);
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
    if (msgs.length === 0) return;
    setSmartCreateMessages(msgs);
  };

  /** 同步到事项(matter completion 阶段接入)。 */
  const onSyncMatter = () => {
    const msgs = findMessages();
    // eslint-disable-next-line no-console
    console.log("[chat] 同步到事项 click(P3+ 跨 matter feature)", { count: msgs.length, msgs });
    toast.info("同步到事项即将接入(matter completion)");
  };

  const btn =
    "flex h-8 items-center rounded-full px-4 text-[14px] font-medium leading-none text-[#1c1c23] transition-colors hover:bg-[rgba(28,28,35,0.08)] disabled:cursor-not-allowed disabled:opacity-40";
  const btnDanger =
    "flex h-8 items-center rounded-full px-4 text-[14px] font-medium leading-none text-[#FF563B] transition-colors hover:bg-[rgba(255,86,59,0.08)] disabled:cursor-not-allowed disabled:opacity-40";
  const sep = "h-5 w-px shrink-0 bg-[rgba(28,28,35,0.15)]";

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white px-4 py-1 whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("per")}
            className={btn}
          >
            逐条转发
          </button>
          <span className={sep} />
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("merge")}
            className={btn}
          >
            合并转发
          </button>
          <span className={sep} />
          <button type="button" disabled={count === 0} onClick={onCreateMatter} className={btn}>
            创建新事项
          </button>
          <span className={sep} />
          <button type="button" disabled={count === 0} onClick={onSyncMatter} className={btn}>
            同步到事项
          </button>
          <span className={sep} />
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirmDelete(true)}
            className={btnDanger}
          >
            删除
          </button>
          <span className={sep} />
          <button
            type="button"
            aria-label="退出多选"
            title="退出多选"
            onClick={() => chatSelectionActions.exit()}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.08)] hover:text-[#1c1c23]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M1 1L13 13M13 1L1 13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
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

      <SmartCreateModal
        open={smartCreateMessages.length > 0}
        channel={channel}
        messages={smartCreateMessages}
        onClose={() => {
          setSmartCreateMessages([]);
          chatSelectionActions.exit();
        }}
      />
    </>
  );
}
