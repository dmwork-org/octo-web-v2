import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import WKSDK, { type Channel, MessageImage, MessageText } from "wukongimjssdk";
import { Image as ImageIcon, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { FileContent } from "@/features/base/im/file-content";

interface ComposerProps {
  channel: Channel;
}

/** 读图片文件的自然宽高(便于发送时回填到 MessageImage)。 */
function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    img.src = url;
  });
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.substring(i + 1).toLowerCase() : "";
}

/**
 * 纯文本 + 图片 + 文件 Composer(P2-B6 task callback 自动接管上传)。
 *
 * - Enter 发送文本,Shift+Enter 换行
 * - Image 按钮:选图片 → MessageImage(file, w, h) → SDK send → 上传 → ack
 * - Paperclip 按钮:选文件 → FileContent(file, name, ext, size) → SDK send → 上传 → ack
 *
 * P3 加:富文本(TipTap) / 截屏 / @ / 表情 / 草稿 / 引用回复 / 多选转发。
 */
export function Composer({ channel }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendText = async () => {
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

  const sendImage = async (file: File) => {
    try {
      const { width, height } = await readImageSize(file);
      const image = new MessageImage(file, width, height);
      await WKSDK.shared().chatManager.send(image, channel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片发送失败");
    }
  };

  const sendFile = async (file: File) => {
    try {
      const content = new FileContent(file, file.name, extOf(file.name), file.size);
      await WKSDK.shared().chatManager.send(content, channel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件发送失败");
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendText();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendText();
    }
  };

  const onImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void sendImage(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void sendFile(file);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex shrink-0 items-end gap-2 border-t border-border-subtle bg-bg-surface p-3"
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageChange}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

      <Button
        htmlType="button"
        type="tertiary"
        theme="borderless"
        size="default"
        iconOnly
        onClick={() => imageInputRef.current?.click()}
        aria-label="发送图片"
        title="发送图片"
      >
        <ImageIcon size={18} />
      </Button>
      <Button
        htmlType="button"
        type="tertiary"
        theme="borderless"
        size="default"
        iconOnly
        onClick={() => fileInputRef.current?.click()}
        aria-label="发送文件"
        title="发送文件"
      >
        <Paperclip size={18} />
      </Button>

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
