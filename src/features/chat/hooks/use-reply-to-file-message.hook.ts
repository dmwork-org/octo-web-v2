import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, Message, MessageText } from "wukongimjssdk";
import { authStore } from "@/features/base/stores/auth";
import { replyToMessage } from "@/features/chat/lib/reply-to-message";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";

interface MessagePages {
  pages: Message[][];
}

function findMessageInCache(
  qc: ReturnType<typeof useQueryClient>,
  channelId: string,
  channelType: number,
  messageId: string,
): Message | null {
  const cache = qc.getQueryData<MessagePages>(messagesQueryKey(channelId, channelType));
  if (!cache) return null;
  for (const page of cache.pages) {
    for (const m of page) {
      if (m.messageID === messageId) return m;
    }
  }
  return null;
}

/**
 * 文件预览面板"回复"按钮的处理逻辑 — 1:1 对齐旧 dmworkbase
 * `Conversation.replyToFileMessage`(Conversation/index.tsx:378):
 *
 * 1. 优先从当前 channel 的 messages query cache 找该消息(messageID 匹配)
 *    → 直接拿真 Message 传给 replyToMessage(quoted bar 渲染完整 content)
 * 2. cache 找不到(消息在更老的页未拉到本地)→ 构造 fakeMessage:
 *    - messageID / messageSeq / fromUID 用 FilePreviewInfo 字段
 *    - content = new MessageText(conversationDigest)
 *      (老仓注释:MessageText.conversationDigest getter 返回 text 本身,quoted bar
 *      只读 conversationDigest 字段,所以 fakeMessage 显示无差;contentType 不一致
 *      不影响 ReplyView 渲染)
 *    - 关键:必须用 MessageText 实例而非 plain object — SDK 序列化 reply.content
 *      时调 content.encode(),plain object 没有 encode 会导致 reply 内容丢失
 * 3. 走 replyToMessage helper:群聊非自己消息时自动 @ 源发送者(对齐老仓
 *    `_messageInputContext?.addMention(uid, name)`),与右键菜单 reply 入口
 *    统一行为(避免不对称)
 *
 * 触发条件不齐全(messageId / messageSeq / fromUID / sourceChannel* 任一缺)
 * 返回 null — file-preview-panel 隐藏 reply 按钮(对齐老仓 handleReply 条件判定)。
 */
export function useReplyToFileMessage(file: FilePreviewInfo): (() => void) | null {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? null);

  const canReply =
    !!file.messageId &&
    file.messageSeq !== undefined &&
    !!file.fromUID &&
    !!file.sourceChannelId &&
    file.sourceChannelType !== undefined;

  const handler = useCallback(() => {
    if (!canReply) return;
    const channelId = file.sourceChannelId!;
    const channelType = file.sourceChannelType!;
    const channel = new Channel(channelId, channelType);

    const cached = findMessageInCache(qc, channelId, channelType, file.messageId!);
    let target: Message;
    if (cached) {
      target = cached;
    } else {
      const fake = new Message();
      fake.messageID = file.messageId!;
      fake.messageSeq = file.messageSeq!;
      fake.fromUID = file.fromUID!;
      fake.channel = channel;
      fake.content = new MessageText(file.conversationDigest ?? file.name);
      target = fake;
    }
    replyToMessage(channel, target, myUid);
  }, [canReply, file, qc, myUid]);

  return canReply ? handler : null;
}
