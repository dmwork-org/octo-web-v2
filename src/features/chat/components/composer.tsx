import { useState, type FormEvent, type KeyboardEvent } from "react";
import WKSDK, { type Channel, MessageText } from "wukongimjssdk";
import { Send } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";

interface ComposerProps {
  channel: Channel;
}

/**
 * 纯文本发送 Composer(P2-A3 最小版)。
 *
 * 行为:
 * - Enter 发送,Shift+Enter 换行
 * - 调 `chatManager.send(new MessageText(text), channel)` 发送
 * - SDK 把消息也广播给 messageListener,UI 通过 useMessagesSync 拿到回显
 *
 * P3 加:富文本 / 图片 / 文件 / @ / 表情 / 草稿持久化(extra.draft)。
 */
export function Composer({ channel }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      await WKSDK.shared().chatManager.send(new MessageText(value), channel);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void send();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 items-end gap-2 border-t border-border-subtle bg-bg-surface p-3"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="说点什么...(Enter 发送, Shift+Enter 换行)"
        className="flex-1 resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
      />
      <Button
        htmlType="submit"
        type="primary"
        theme="solid"
        size="default"
        loading={sending}
        disabled={!text.trim()}
      >
        <Send size={16} />
        发送
      </Button>
    </form>
  );
}
