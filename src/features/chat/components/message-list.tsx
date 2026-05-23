import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Channel, type Message, MessageContentType } from "wukongimjssdk";
import { messagesQueryOptions } from "@/features/chat/queries/messages.query";
import { useMessagesSync } from "@/features/chat/hooks/use-messages-sync.hook";
import { TextRenderer } from "@/features/chat/message-renderers/text-renderer";

interface MessageListProps {
  channel: Channel;
}

function MessageRow({ message }: { message: Message }) {
  switch (message.contentType) {
    case MessageContentType.text:
      return <TextRenderer message={message} />;
    default:
      // P2-A3 阶段未覆盖的类型,显示占位避免渲染崩
      return (
        <div className="flex justify-center">
          <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
            [不支持的消息类型 {message.contentType}]
          </span>
        </div>
      );
  }
}

/**
 * 滚动到底部 hook — 列表更新后(新消息追加)自动滚到底。
 */
function useScrollToBottomOnUpdate(messages: Message[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);
  return ref;
}

export function MessageList({ channel }: MessageListProps) {
  useMessagesSync(channel);
  const { data, isLoading, error } = useQuery(messagesQueryOptions(channel));
  const messages = data ?? [];
  const scrollRef = useScrollToBottomOnUpdate(messages);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载消息…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">消息加载失败</div>
    );
  }
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        暂无消息,发一条试试
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {messages.map((m) => (
        <MessageRow key={m.clientMsgNo || m.messageID} message={m} />
      ))}
    </div>
  );
}
