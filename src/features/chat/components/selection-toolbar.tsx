import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import type { Channel, Message } from "wukongimjssdk";
import { Forward, Trash2, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { deleteMessages as deleteMessagesApi } from "@/features/base/api/endpoints/message.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";

interface SelectionToolbarProps {
  channel: Channel;
}

/**
 * 多选模式底部工具栏(对应旧 ConversationVM editOn 时的 toolbar):
 *   [已选 N]                       [转发] [删除] [退出]
 *
 * 替代 Composer 显示。删除走 ConfirmModal 二次确认。
 *
 * 转发支持多选:多条按时间顺序逐条 send 到每个 target(简化版,接收方看到 N 条
 * 独立消息)。**合并卡片**(MergeforwardContent wrap 成单卡)留 P3-B2 真正接入。
 */
export function SelectionToolbar({ channel }: SelectionToolbarProps) {
  const qc = useQueryClient();
  const ids = useStore(chatSelectionStore, (s) => s.ids);
  const count = ids.size;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);

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

  const onForward = () => {
    const msgs = findMessages();
    if (msgs.length === 0) return;
    setForwardMessages(msgs);
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle bg-bg-surface px-4 py-3">
        <span className="text-sm font-medium text-text-primary">已选 {count} 条</span>
        <div className="flex items-center gap-2">
          <Button
            type="tertiary"
            theme="borderless"
            size="small"
            disabled={count === 0}
            onClick={onForward}
          >
            <Forward size={14} />
            转发
          </Button>
          <Button
            type="danger"
            theme="borderless"
            size="small"
            disabled={count === 0}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
            删除
          </Button>
          <Button
            type="tertiary"
            theme="borderless"
            size="small"
            onClick={() => chatSelectionActions.exit()}
          >
            <X size={14} />
            退出
          </Button>
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

      {forwardMessages.length > 0 ? (
        <ForwardModal
          open={forwardMessages.length > 0}
          messages={forwardMessages}
          onClose={() => {
            setForwardMessages([]);
            chatSelectionActions.exit();
          }}
        />
      ) : null}
    </>
  );
}
