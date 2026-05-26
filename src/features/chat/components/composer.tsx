import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  Mention as ImMention,
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
import { authStore } from "@/features/base/stores/auth";
import {
  chatReplyActions,
  chatReplyStore,
  selectReplyForChannel,
} from "@/features/chat/stores/chat-reply";
import { createMentionSuggestion } from "@/features/chat/components/mention-suggestion";
import type { MentionItem } from "@/features/chat/components/mention-list";
import { useComposerDraft } from "@/features/chat/hooks/use-composer-draft.hook";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";

/** ChannelType 7 = ChannelTypeCommunityTopic;子区也走 mention(成员=父群成员)。 */
const CHANNEL_TYPE_THREAD = 7;

interface ComposerProps {
  channel: Channel;
}

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

function fromName(uid: string): string {
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  return info?.title ?? uid;
}

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
 * Enter / Shift+Enter keymap 扩展。Mention popover 打开时它的 onKeyDown(suggestion
 * plugin 在 keymap 上层注入)优先消费 Enter,本扩展不会被触发。
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

interface ExtractedText {
  text: string;
  /** 普通成员 uids(不含 @所有人) */
  uids: string[];
  /** 是否含 @所有人 */
  all: boolean;
}

function appendToLastLine(lines: string[], chunk: string): void {
  if (lines.length === 0) lines.push("");
  lines[lines.length - 1] += chunk;
}

/**
 * 从 Editor 里提取发送用文本 + mention 信息。
 *
 * Mention node 自身渲染 `@${label}` 并挂 data-id / data-label;`editor.getText()` 默认
 * 会 skip Mention node。我们手动遍历 doc:遇到 mention 就拼 `@label` 并把 id push 到
 * uids(`@all` 特殊化为 mention.all=true)。
 *
 * 段落之间用 `\n` 分隔,与旧 textarea.value 等价。
 */
function extractFromEditor(editor: Editor): ExtractedText {
  const uids: string[] = [];
  let all = false;
  const lines: string[] = [];

  editor.state.doc.descendants((node, _pos, parent) => {
    if (node.type.name === "mention") {
      const id = (node.attrs as { id?: string }).id;
      const label = (node.attrs as { label?: string }).label ?? id ?? "";
      if (id === "@all") {
        all = true;
        appendToLastLine(lines, "@所有人");
      } else if (id) {
        uids.push(id);
        appendToLastLine(lines, `@${label}`);
      }
      return false;
    }
    if (node.isText) {
      appendToLastLine(lines, node.text ?? "");
      return false;
    }
    if (node.type.name === "paragraph" && parent && parent.type.name === "doc") {
      lines.push("");
      return undefined;
    }
    if (node.type.name === "hardBreak") {
      appendToLastLine(lines, "\n");
      return false;
    }
    return undefined;
  });

  return { text: lines.join("\n").trim(), uids, all };
}

/**
 * Composer(P3-K1/K-2/K-3,TipTap + Mention + 草稿):
 *
 * - StarterKit 精简 + Placeholder + SubmitOnEnter + Mention(群 / 子区启用)
 * - Mention 候选 = 当前**群成员**(SDK getSubscribes,K-1 接的 membersync),不是
 *   整个 Space 成员;子区走父群成员(useGroupSubscribers 内 parse)
 * - 发送时 extractFromEditor 把 Mention node 转 `@label`,uid 收集到 SDK Mention.uids;
 *   `@所有人` 特殊化为 SDK Mention.all=true
 * - 草稿:per-channel localStorage,channel 切换 save 旧 / load 新,发送成功清掉
 *
 * Reply 流程(per-channel):
 *   message-row 右键"回复" → chatReplyActions.set(channel, message) →
 *   Composer 顶部按 current channel 取 reply 显示 → 发送时 Reply attach 到 content →
 *   成功 clear(channel) / 用户 ✕ 关掉也 clear(channel)。切走再切回 reply 状态保留。
 */
export function Composer({ channel }: ComposerProps) {
  const [sending, setSending] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => selectReplyForChannel(s, channel));
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isMentionable = isGroup || isThread;

  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  // 群成员候选(子区取父群成员;syncSubscribes 异步,改变后 listener 触发重渲)
  const subscribers = useGroupSubscribers(channel, isMentionable);

  const memberCandidates = useMemo<MentionItem[]>(() => {
    if (!isMentionable) return [];
    const all: MentionItem = { id: "@all", label: "所有人" };
    return [
      all,
      ...subscribers
        // 去掉自己 + 已删除成员 + AI 机器人(robot=1 单独走 AI 链路,不在 @ 候选里)
        .filter((s) => {
          if (s.uid === myUid) return false;
          if (s.isDeleted) return false;
          const og = s.orgData as { robot?: number } | undefined;
          if (og?.robot === 1) return false;
          return true;
        })
        // 显示名优先 remark > name > uid(对齐群里的展示口径)
        .map((s) => ({ id: s.uid, label: s.remark || s.name || s.uid })),
    ];
  }, [subscribers, myUid, isMentionable]);

  const sendTextRef = useRef<() => void>(() => {});

  // Mention items 也要 ref 稳定(useEditor 只跑一次,suggestion 闭包拿到的得是最新候选)
  const candidatesRef = useRef<MentionItem[]>([]);
  candidatesRef.current = memberCandidates;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: isMentionable
          ? "说点什么...(Enter 发送, Shift+Enter 换行, @ 提及)"
          : "说点什么...(Enter 发送, Shift+Enter 换行)",
      }),
      ...(isMentionable
        ? [
            Mention.configure({
              HTMLAttributes: {
                class: "mx-0.5 inline-block rounded-sm bg-brand-tint px-1 font-medium text-brand",
              },
              renderText: ({ node }) => {
                const label = (node.attrs as { label?: string; id?: string }).label;
                const id = (node.attrs as { id?: string }).id;
                if (id === "@all") return "@所有人";
                return `@${label ?? id ?? ""}`;
              },
              // TipTap MentionNodeAttrs.id 是 `string | null`,我的 MentionItem.id 是 string —
              // subtype 上完全兼容,但 TS 因变性报错。安全地用 `as never` 跨过类型噪音(运行时一致)。
              suggestion: createMentionSuggestion((query) => {
                const kw = query.toLowerCase();
                const list = candidatesRef.current;
                if (!kw) return list.slice(0, 8);
                return list
                  .filter(
                    (c) => c.label.toLowerCase().includes(kw) || c.id.toLowerCase().includes(kw),
                  )
                  .slice(0, 8);
              }) as never,
            }),
          ]
        : []),
      createSubmitOnEnter(() => sendTextRef.current()),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[2.5rem] max-h-[12rem] overflow-y-auto px-1 py-1 text-sm leading-snug text-text-primary outline-none",
      },
    },
  });

  // K-3:草稿恢复(channel 切换 save 旧 / load 新;发送成功调用 dropDraft 清掉)
  const { clearDraft: dropDraft } = useComposerDraft(editor, channel);

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
    const { text, uids, all } = extractFromEditor(ed);
    if (!text || sending) return;
    setSending(true);
    try {
      const content = new MessageText(text);
      const reply = buildReply();
      if (reply) content.reply = reply;
      if (isMentionable && (all || uids.length > 0)) {
        const m = new ImMention();
        if (all) m.all = true;
        if (uids.length > 0) m.uids = uids;
        content.mention = m;
      }
      await WKSDK.shared().chatManager.send(content, channel);
      ed.commands.clearContent();
      chatReplyActions.clear(channel);
      dropDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  useSyncSendTextRef(editor, sendText, sendTextRef);

  const sendImage = async (file: File) => {
    try {
      const { width, height } = await readImageSize(file);
      const image = new MessageImage(file, width, height);
      const reply = buildReply();
      if (reply) image.reply = reply;
      await WKSDK.shared().chatManager.send(image, channel);
      chatReplyActions.clear(channel);
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
      chatReplyActions.clear(channel);
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
  const hasContent = !!editor && extractFromEditor(editor).text.length > 0;

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
              onClick={() => chatReplyActions.clear(channel)}
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
