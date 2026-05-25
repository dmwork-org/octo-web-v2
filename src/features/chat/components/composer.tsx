import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  Mention,
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
import { MentionPopover, type MentionCandidate } from "@/features/chat/components/mention-popover";

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

interface MentionState {
  uids: Set<string>;
  all: boolean;
}

interface MentionTrigger {
  /** @ 在 text 中的字符 index(含 @) */
  startIndex: number;
  /** 当前 keyword(光标前 @ 后输入的字符,不含 @) */
  keyword: string;
  /** 光标 viewport 坐标 */
  caretLeft: number;
  caretTop: number;
}

/**
 * 探测光标前最近一个能触发 mention 的 `@` 位置。
 * 规则:
 * - `@` 前一个字符是空白 / 行首 / 标点视为触发
 * - `@` 与光标之间不能含空白或换行
 * - 否则视为普通文本,返回 null
 */
function detectMentionTrigger(
  text: string,
  caret: number,
): { start: number; keyword: string } | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "@") {
      const prev = i === 0 ? " " : text[i - 1];
      if (/\s|[.,;:!?，。;:、!?]/.test(prev) || i === 0) {
        return { start: i, keyword: text.slice(i + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

/** 估算 textarea 内字符位置在 viewport 中的坐标(用于 popover 锚点)。 */
function getCaretViewportPos(
  el: HTMLTextAreaElement,
  index: number,
): { left: number; top: number } {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const text = el.value.slice(0, index);
  const lines = text.split("\n");
  const row = lines.length - 1;
  return {
    left: rect.left + 12,
    top: rect.top - el.scrollTop + row * lineHeight + lineHeight + 4,
  };
}

/**
 * Composer(对应旧 .wk-messageinput-card):
 * - 外 padding 0 16px 8px,内 card rounded-xl border + bg-surface + focus-within:border-brand
 * - **顶部 quoted bar**(reply mode):头像 + 发送者名 + 类型 icon + 两行 clamp digest + ✕
 * - textarea(可滚,无背景),底部 actionbox(图片/文件 + 发送)
 * - Enter 发送 / Shift+Enter 换行
 * - @ 触发 MentionPopover(仅群聊),↑↓ 选,Enter 确认插入 @name
 *
 * Reply 流程:message-row 右键"回复" → chatReplyActions.set →
 *   Composer 顶部显示 quoted bar → 发送时 Reply attach 到 content → 成功 clear
 *
 * @mention 流程:输入 `@` 触发 → MentionPopover 候选 → Enter 选中插入 `@name ` →
 *   发送时 attach SDK Mention { all, uids } 到 MessageText.mention(仅群聊)
 */
export function Composer({ channel }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => s.replyingTo);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // @mention state
  const [mention, setMention] = useState<MentionState>({ uids: new Set(), all: false });
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const candidatesRef = useRef<MentionCandidate[]>([]);

  const isGroup = channel.channelType === ChannelTypeGroup;

  const buildReply = () => {
    if (!replyingTo) return undefined;
    const r = new Reply();
    r.messageID = replyingTo.messageID;
    r.messageSeq = replyingTo.messageSeq;
    r.fromUID = replyingTo.fromUID;
    r.fromName = fromName(replyingTo.fromUID);
    r.content = replyingTo.content;
    return r;
  };

  /** 构造发送时的 Mention。 */
  const buildMention = (): Mention | undefined => {
    if (!isGroup) return undefined;
    if (!mention.all && mention.uids.size === 0) return undefined;
    const m = new Mention();
    if (mention.all) m.all = true;
    if (mention.uids.size > 0) m.uids = [...mention.uids];
    return m;
  };

  const resetMention = () => {
    setMention({ uids: new Set(), all: false });
    setTrigger(null);
  };

  const onTextChange = (next: string, caret?: number | null) => {
    setText(next);
    if (!isGroup) return;
    const ta = textareaRef.current;
    const c = caret ?? ta?.selectionStart ?? next.length;
    const t = detectMentionTrigger(next, c);
    if (t && ta) {
      const pos = getCaretViewportPos(ta, t.start);
      setTrigger({
        startIndex: t.start,
        keyword: t.keyword,
        caretLeft: pos.left,
        caretTop: pos.top,
      });
    } else {
      setTrigger(null);
    }
  };

  const insertMention = (c: MentionCandidate) => {
    if (!trigger) return;
    const before = text.slice(0, trigger.startIndex);
    const afterCaretIdx = trigger.startIndex + 1 + trigger.keyword.length;
    const after = text.slice(afterCaretIdx);
    const inserted = `@${c.name} `;
    const next = `${before}${inserted}${after}`;
    setText(next);
    setMention((prev) => {
      const u = new Set(prev.uids);
      let all = prev.all;
      if (c.isAll) all = true;
      else u.add(c.uid);
      return { uids: u, all };
    });
    setTrigger(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const pos = before.length + inserted.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const sendText = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const content = new MessageText(value);
      const reply = buildReply();
      if (reply) content.reply = reply;
      const m = buildMention();
      if (m) content.mention = m;
      await WKSDK.shared().chatManager.send(content, channel);
      setText("");
      chatReplyActions.clear();
      resetMention();
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

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void sendText();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (trigger && candidatesRef.current.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((activeIndex + 1) % candidatesRef.current.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const len = candidatesRef.current.length;
        setActiveIndex((activeIndex - 1 + len) % len);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const c = candidatesRef.current[activeIndex];
        if (c) insertMention(c);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }
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

  const replyDigest = replyingTo
    ? ((replyingTo.content as { conversationDigest?: string } | undefined)?.conversationDigest ??
      "")
    : "";
  const replySender = replyingTo ? fromName(replyingTo.fromUID) : "";
  const replyTypeMeta = quotedTypeMeta(replyingTo?.content);

  const onCandidatesChange = useMemo(() => {
    return (list: MentionCandidate[]) => {
      candidatesRef.current = list;
    };
  }, []);

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

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value, e.target.selectionStart)}
          onClick={(e) => {
            const ta = e.currentTarget;
            onTextChange(ta.value, ta.selectionStart);
          }}
          onKeyUp={(e) => {
            if (
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "Home" ||
              e.key === "End"
            ) {
              const ta = e.currentTarget;
              onTextChange(ta.value, ta.selectionStart);
            }
          }}
          onBlur={() => {
            setTimeout(() => setTrigger(null), 100);
          }}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={
            isGroup
              ? "说点什么...(Enter 发送,Shift+Enter 换行,@ 提及)"
              : "说点什么...(Enter 发送, Shift+Enter 换行)"
          }
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

      {trigger ? (
        <MentionPopover
          keyword={trigger.keyword}
          anchorLeft={trigger.caretLeft}
          anchorTop={trigger.caretTop}
          activeIndex={activeIndex}
          setActiveIndex={setActiveIndex}
          onCandidatesChange={onCandidatesChange}
          onSelect={insertMention}
          onClose={() => setTrigger(null)}
        />
      ) : null}
    </div>
  );
}
