import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  MessageContentType,
  MessageImage,
  MessageText,
  Reply,
  type MessageContent,
} from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import { FileText, Image as ImageIcon, Mic, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { FileContent } from "@/features/base/im/file-content";
import { chatReplyActions, chatReplyStore } from "@/features/chat/stores/chat-reply";

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

/** 取发送者展示名(channelInfo.title fallback fromUID)。 */
function fromName(uid: string): string {
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title ?? uid;
}

/**
 * 引用消息类型缩略 — 返回 { icon, hint }。文本返回 null icon,
 * 由调用方直接展示 digest。其它类型给个小图标 + 类型文案。
 *
 * FileContent.contentType = 6(项目内约定),Voice = 3(SDK 未导出常量)。
 */
function quotedTypeMeta(content: MessageContent | undefined): {
  Icon: typeof ImageIcon | null;
  hint: string;
} {
  const ct = (content as { contentType?: number } | undefined)?.contentType;
  if (ct === MessageContentType.image) return { Icon: ImageIcon, hint: "[图片]" };
  if (ct === MessageContentType.text) return { Icon: null, hint: "" };
  if (ct === 6) return { Icon: FileText, hint: "[文件]" };
  if (ct === 3) return { Icon: Mic, hint: "[语音]" };
  return { Icon: null, hint: "" };
}

/**
 * Enter / Shift+Enter / Mod+Enter keymap 扩展:
 * - Enter        → 触发 onSubmit prop(发送)
 * - Shift+Enter  → 默认 hardBreak(换行)
 *
 * 用 Extension 注入 prosemirror keymap,比 onKeyDown DOM listener 更靠谱(IME 不会误触)。
 */
function createSubmitOnEnter(onSubmit: () => void) {
  return Extension.create({
    name: "submitOnEnter",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          onSubmit();
          return true;
        },
        "Shift-Enter": ({ editor }) =>
          editor.commands.first(({ commands }) => [
            () => commands.newlineInCode(),
            () => commands.createParagraphNear(),
            () => commands.liftEmptyBlock(),
            () => commands.splitBlock(),
          ]),
      };
    },
  });
}

/**
 * Composer(对应旧 .wk-messageinput-card,P3-K1 升级到 TipTap):
 *
 * - 外 padding 0 16px 8px,内 card rounded-xl border + bg-surface + focus-within:border-brand
 * - **顶部 quoted bar**(reply mode):头像 + 发送者名 + 类型 icon + 两行 clamp digest + ✕
 * - TipTap Editor(StarterKit 精简 + Placeholder + 自定义 SubmitOnEnter)
 * - 底部 actionbox(图片/文件 + 发送)
 * - Enter 发送 / Shift+Enter 换行(走 prosemirror keymap,IME 安全)
 * - **K-2 之后**:接 @tiptap/extension-mention,这里暂时只发纯文本;
 *   旧手写 mention popover 已移除
 *
 * Reply 流程:message-row 右键"回复" → chatReplyActions.set →
 *   Composer 顶部显示 quoted bar → 发送时 Reply attach 到 content → 成功 clear
 *
 * Editor.getText() 取纯文本提取(段落间换行用 \n),与旧 Composer textarea.value 等价语义。
 */
export function Composer({ channel }: ComposerProps) {
  const [sending, setSending] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => s.replyingTo);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * sendText 在 useEffect / SubmitOnEnter 闭包里被调,要保证总是最新引用 —
   * 用 ref 把闭包指针稳定住(对齐 React 18 Concurrent 模式不变)。
   */
  const sendTextRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 关闭一堆富文本块(标题 / 列表 / 引用块 / 代码块 / 水平线),只保留段落 + 软换行 +
        // 文本 / 加粗斜体下划线删除线;聊天场景不需要 H1/H2/列表/引用块 / blockquote
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "说点什么...(Enter 发送, Shift+Enter 换行)",
      }),
      createSubmitOnEnter(() => sendTextRef.current()),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[2.5rem] max-h-[12rem] overflow-y-auto px-1 py-1 text-sm leading-snug text-text-primary outline-none",
        // ProseMirror 的 placeholder 通过 css :empty + data-placeholder 渲染;Tailwind 兜底
      },
    },
  });

  const buildReply = useMemo(
    () => () => {
      if (!replyingTo) return undefined;
      const r = new Reply();
      r.messageID = replyingTo.messageID;
      r.messageSeq = replyingTo.messageSeq;
      r.fromUID = replyingTo.fromUID;
      r.fromName = fromName(replyingTo.fromUID);
      r.content = replyingTo.content;
      return r;
    },
    [replyingTo],
  );

  const sendText = async (ed: Editor) => {
    const value = ed.getText().trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const content = new MessageText(value);
      const reply = buildReply();
      if (reply) content.reply = reply;
      await WKSDK.shared().chatManager.send(content, channel);
      ed.commands.clearContent();
      chatReplyActions.clear();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  // 同步 ref:editor 改变时重指 sendTextRef,SubmitOnEnter Extension 闭包永远拿到最新发送函数
  useSyncSendTextRef(editor, sendText, sendTextRef);

  const sendImage = async (file: File) => {
    try {
      const { width, height } = await readImageSize(file);
      const image = new MessageImage(file, width, height);
      const reply = buildReply();
      if (reply) image.reply = reply;
      await WKSDK.shared().chatManager.send(image, channel);
      chatReplyActions.clear();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "图片发送失败");
    }
  };

  const sendFile = async (file: File) => {
    try {
      const content = new FileContent(file, file.name, extOf(file.name), file.size);
      const reply = buildReply();
      if (reply) content.reply = reply;
      await WKSDK.shared().chatManager.send(content, channel);
      chatReplyActions.clear();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件发送失败");
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editor) void sendText(editor);
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

  const replyDigest = replyingTo
    ? ((replyingTo.content as { conversationDigest?: string } | undefined)?.conversationDigest ??
      "")
    : "";
  const replySender = replyingTo ? fromName(replyingTo.fromUID) : "";
  const replyTypeMeta = quotedTypeMeta(replyingTo?.content);

  // 是否有正文(决定发送按钮 disabled)
  const hasContent = !!editor && editor.getText().trim().length > 0;
  const isGroup = channel.channelType === ChannelTypeGroup;

  return (
    <div className="shrink-0 px-4 pt-2 pb-3">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-3 transition-colors focus-within:border-brand"
      >
        {replyingTo ? (
          <div className="flex items-start gap-2 rounded-md border border-border-subtle bg-bg-elevated px-2.5 py-2 text-[12px]">
            <ChannelAvatar
              channel={new Channel(replyingTo.fromUID, ChannelTypePerson)}
              size={28}
              title={replySender}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-text-tertiary">回复</span>
                <span className="truncate font-semibold text-text-primary">{replySender}</span>
              </div>
              <div className="flex items-center gap-1 text-text-secondary">
                {replyTypeMeta.Icon ? <replyTypeMeta.Icon size={12} className="shrink-0" /> : null}
                <span className="line-clamp-2 break-words leading-snug">
                  {replyTypeMeta.hint ? `${replyTypeMeta.hint} ` : ""}
                  {replyDigest}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => chatReplyActions.clear()}
              aria-label="取消回复"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        ) : null}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImageChange}
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

        <EditorContent editor={editor} />

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
            {/* @mention 按钮在 K-2 接入 TipTap suggestion 后再加;群聊场景预留位 */}
            {isGroup ? <span className="hidden" /> : null}
          </div>
          <Button
            htmlType="submit"
            type="primary"
            theme="solid"
            size="default"
            loading={sending}
            disabled={!hasContent}
          >
            <Send size={14} />
            发送
          </Button>
        </div>
      </form>
    </div>
  );
}

/** editor / sendText 变化时重指 sendTextRef,让 keymap 闭包永远拿最新引用。 */
function useSyncSendTextRef(
  editor: Editor | null,
  sendText: (ed: Editor) => Promise<void>,
  ref: React.MutableRefObject<() => void>,
) {
  useEffect(() => {
    ref.current = () => {
      if (editor) void sendText(editor);
    };
  }, [editor, sendText, ref]);
}
