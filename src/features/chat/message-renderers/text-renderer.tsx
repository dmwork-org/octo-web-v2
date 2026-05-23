import { type Message, type MessageText } from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";

interface TextRendererProps {
  message: Message;
}

/**
 * 单条文本消息气泡。
 *
 * - 自己发的消息:右对齐,bg-self
 * - 他人发的:左对齐,bg-bubble
 *
 * 系统消息 / 图片 / 文件 由各自 renderer 处理(P3 落)。
 */
export function TextRenderer({ message }: TextRendererProps) {
  const me = useStore(authStore, (s) => s.user?.uid ?? null);
  const isSelf = me !== null && message.fromUID === me;
  const text = (message.content as MessageText).text ?? "";

  return (
    <div className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[70%] rounded-md px-3 py-2 text-sm leading-snug ${
          isSelf ? "bg-bg-selected text-text-primary" : "bg-bg-elevated text-text-primary"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
