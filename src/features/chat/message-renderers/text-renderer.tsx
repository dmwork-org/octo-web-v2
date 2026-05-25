import { type Message, type MessageText } from "wukongimjssdk";

interface TextRendererProps {
  message: Message;
}

/**
 * 文本消息正文(不带气泡 — Slack 风格,头像 + sender 在 MessageRow wrapper 内)。
 * 保留 whitespace-pre-wrap 让换行可见。
 */
export function TextRenderer({ message }: TextRendererProps) {
  const text = (message.content as MessageText).text ?? "";
  return <p className="text-sm leading-snug whitespace-pre-wrap text-text-primary">{text}</p>;
}
