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
 * Composer(对应旧 .wk-messageinput-card):
 * - 外 padding 0 16px 8px,内 card rounded-xl border + bg-surface + focus-within:border-brand
 * - 顶部 textarea(可滚,无背景),底部 actionbox(图片/文件 + 发送)
 * - Enter 发送 / Shift+Enter 换行
 * - 图片选择 → MessageImage,文件选择 → FileContent,P2-B6 task callback 接管上传
 *
 * P3 加:TipTap 富文本 / @ / 表情 / 截屏 / 草稿 / 引用回复 / 多选转发。
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
    <div className="shrink-0 px-4 pt-2 pb-3">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-3 transition-colors focus-within:border-brand"
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImageChange}
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="说点什么...(Enter 发送, Shift+Enter 换行)"
          className="w-full resize-none border-0 bg-transparent px-1 text-sm leading-snug text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label="发送图片"
              title="发送图片"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <ImageIcon size={18} />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="发送文件"
              title="发送文件"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <Paperclip size={18} />
            </button>
          </div>
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            size="default"
            loading={sending}
            disabled={!text.trim()}
          >
            <Send size={14} />
            发送
          </Button>
        </div>
      </form>
    </div>
  );
}
