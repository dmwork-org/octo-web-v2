import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
import {
  AtSign,
  CheckSquare,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  Paperclip,
  Smile,
  X,
} from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { EmojiPickerPopover } from "@/features/chat/components/emoji-picker-popover";
import { SlashCommandMenu } from "@/features/chat/components/slash-command-menu";
import { ComposerTopAttachmentBar } from "@/features/chat/components/composer-top-attachment-bar";
import { FileContent } from "@/features/base/im/file-content";
import { authStore } from "@/features/base/stores/auth";
import { transcribeVoice } from "@/features/base/api/endpoints/voice.api";
import {
  chatReplyActions,
  chatReplyStore,
  selectReplyForChannel,
} from "@/features/chat/stores/chat-reply";
import { createMentionSuggestion } from "@/features/chat/components/mention-suggestion";
import type { MentionItem } from "@/features/chat/components/mention-list";
import { useComposerDraft } from "@/features/chat/hooks/use-composer-draft.hook";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { useVoiceRecorder } from "@/features/chat/hooks/use-voice-recorder.hook";
import { useVoiceShortcut } from "@/features/chat/hooks/use-voice-shortcut.hook";
import { useApplyPendingMention } from "@/features/chat/hooks/use-apply-pending-mention.hook";
import { useBotCommands } from "@/features/chat/hooks/use-bot-commands.hook";
import { useSlashCommand } from "@/features/chat/hooks/use-slash-command.hook";
import { useComposerAttachments } from "@/features/chat/hooks/use-composer-attachments.hook";
import { AttachmentNode } from "@/features/chat/lib/composer-attachment-node";
import { isImageMime, isVideoMime } from "@/features/chat/lib/composer-files";
import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
  MENTION_UID_LEGACY_ALL,
  MENTION_UID_OLD_ALL_ALIAS,
} from "@/features/base/lib/mention-three-state";

/** ChannelType 7 = ChannelTypeCommunityTopic;子区也走 mention(成员=父群成员)。 */
const CHANNEL_TYPE_THREAD = 5;

/** 录音上限(秒)— 对齐旧 PRD;到时自动 stop 触发转写。 */
const VOICE_MAX_DURATION = 60;

/** Mac 上 Option/Alt 显示 ⌥,其他平台显示 Alt(对齐旧 ALT_KEY)。 */
const ALT_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌥" : "Alt";

/** Mac 上 Cmd 显示 ⌘,其他平台显示 Ctrl。 */
const META_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘" : "Ctrl";

/**
 * 三态 sticky 候选项(对齐旧 buildMentionDropdownItems):
 *   @所有人 → mention.humans=1(纯人,不含 AI)
 *   @所有AI → mention.ais=1(全部 bot)
 *
 * 仅 query 为空时置顶;用户已输入过滤词时只显匹配的成员,避免误选 sticky。
 */
const STICKY_MENTIONS: MentionItem[] = [
  { id: MENTION_UID_HUMANS, label: MENTION_LABEL_HUMANS },
  { id: MENTION_UID_AIS, label: MENTION_LABEL_AIS, isBot: true },
];

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
  if (ct === 4) return { Icon: Mic, hint: "[语音]" };
  return { Icon: null, hint: "" };
}

// 占位符(对齐旧 buildPlaceholder)。
function buildPlaceholder(channel: Channel, name: string): string {
  if (channel.channelType === ChannelTypePerson) {
    return name ? `对 ${name} 发送消息` : "发送消息";
  }
  return name
    ? `在 ${name} 中回复...  ${ALT_KEY}+↵ 创建任务`
    : `输入消息...  ${ALT_KEY}+↵ 创建任务`;
}

// Enter / Shift+Enter keymap。Mention popover 打开时 suggestion 上层 keymap 优先消费 Enter,
// 本扩展不会被触发。斜杠菜单打开时:editorProps.handleKeyDown(优先级最高)消费 Enter
// 并 return true,prosemirror 不再走到本 keymap。
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

function formatRecordTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Composer:TipTap + Mention + 草稿 + 媒体增强 + 斜杠命令 + 附件混排(1:1 旧 UI)。
//
// 工具栏:[😀] [@] [📎] [✓] [🎤▼] [⤢] 全靠右,无 Send 按钮(Enter 直发)。
//
// Mention 三态(A4,对齐旧 mentionRender):
// - sticky 候选:@所有人("-2",humans=1) / @所有AI("-3",ais=1) — 仅 query 空时置顶
// - legacy @所有人("-1" / "@all"):mention.all=1(server 端 rewrite 成 humans=1)
// - 普通成员:mention.uids[]
//
// 附件流(A3):
// - 粘贴图片 → inline AttachmentNode 进 editor(缩略图 + 可拖排序/删)
// - 拖入 / 上传按钮 / 粘贴非图 → 顶部附件区(可删,带预览)
// - 发送:extractOrderedBlocks 按文档顺序拆 text/image/file 块,顶部附件追加在末尾;
//   首条挂 reply
//
// 斜杠命令(A1):bot 私聊 + 文本以 "/" 开头(无空格/换行)→ 浮出菜单。
//
// 长度上限(A2):单条文本块 > 5000 字符 toast + 终止。
export function Composer({ channel }: ComposerProps) {
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => selectReplyForChannel(s, channel));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isMentionable = isGroup || isThread;

  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const subscribers = useGroupSubscribers(channel, isMentionable);
  const botCommands = useBotCommands(channel);
  const attachments = useComposerAttachments();

  const channelName = (() => {
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    return info?.title ?? "";
  })();
  const placeholder = buildPlaceholder(channel, channelName);

  // 仅成员候选(不含 sticky);sticky 由 suggestion 回调按 query 决定是否 prepend
  const memberCandidates = useMemo<MentionItem[]>(() => {
    if (!isMentionable) return [];
    return subscribers
      .filter((s) => s.uid !== myUid && !s.isDeleted)
      .map((s) => {
        const og = s.orgData as { robot?: number } | undefined;
        return {
          id: s.uid,
          label: s.remark || s.name || s.uid,
          isBot: og?.robot === 1,
        };
      });
  }, [subscribers, myUid, isMentionable]);

  const sendRef = useRef<() => void>(() => {});
  const candidatesRef = useRef<MentionItem[]>([]);
  candidatesRef.current = memberCandidates;

  const slashKeyDownRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const slashIsOpenRef = useRef<() => boolean>(() => false);

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
      Placeholder.configure({ placeholder }),
      AttachmentNode,
      ...(isMentionable
        ? [
            Mention.configure({
              HTMLAttributes: {
                class: "mx-0.5 font-semibold text-brand",
              },
              renderText: ({ node }) => {
                const label = (node.attrs as { label?: string; id?: string }).label;
                const id = (node.attrs as { id?: string }).id;
                if (id === MENTION_UID_AIS) return `@${MENTION_LABEL_AIS}`;
                if (
                  id === MENTION_UID_HUMANS ||
                  id === MENTION_UID_LEGACY_ALL ||
                  id === MENTION_UID_OLD_ALL_ALIAS
                ) {
                  return `@${MENTION_LABEL_HUMANS}`;
                }
                return `@${label ?? id ?? ""}`;
              },
              // query 为空时 prepend sticky;非空只过滤成员(避免误选 sticky)。对齐旧 buildMentionDropdownItems。
              suggestion: createMentionSuggestion((query) => {
                const kw = query.toLowerCase();
                const list = candidatesRef.current;
                if (!kw) return [...STICKY_MENTIONS, ...list.slice(0, 8)];
                return list
                  .filter(
                    (c) => c.label.toLowerCase().includes(kw) || c.id.toLowerCase().includes(kw),
                  )
                  .slice(0, 8);
              }) as never,
            }),
          ]
        : []),
      createSubmitOnEnter(() => {
        if (slashIsOpenRef.current()) return;
        sendRef.current();
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-5 max-h-[100px] overflow-y-auto py-1 text-[14px] leading-5 text-text-primary outline-none",
      },
      handleKeyDown: (_view, event) => slashKeyDownRef.current(event),
    },
  });

  const slash = useSlashCommand(editor, botCommands);
  useSyncRef(slashKeyDownRef, slash.handleKeyDown);
  useSyncRef(slashIsOpenRef, slash.isOpen);

  const { clearDraft: dropDraft } = useComposerDraft(editor, channel);

  useApplyPendingMention(channel, editor);

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

  // 多块发送:依次发 ordered text/image/file blocks + 顶部 attachments。首条挂 reply。
  const send = async () => {
    if (!editor || sending) return;
    const MAX_MESSAGE_LENGTH = 5000;
    const blocks = attachments.extractOrderedBlocks(editor);
    const top = attachments.topAttachments;
    const hasText = blocks.some((b) => b.type === "text" && b.text);
    const hasAttach = blocks.some((b) => b.type !== "text") || top.length > 0;
    if (!hasText && !hasAttach) return;

    for (const b of blocks) {
      if (b.type === "text" && b.text.length > MAX_MESSAGE_LENGTH) {
        toast.error(`输入内容长度不能大于 ${MAX_MESSAGE_LENGTH} 字符!`);
        return;
      }
    }

    setSending(true);
    let isFirst = true;
    const attachReplyOnce = (c: MessageContent) => {
      if (!isFirst) return;
      const r = buildReply();
      if (r) (c as { reply?: Reply }).reply = r;
      isFirst = false;
    };

    const sendImageFile = async (file: File) => {
      const { width, height } = await readImageSize(file);
      const image = new MessageImage(file, width, height);
      attachReplyOnce(image);
      await WKSDK.shared().chatManager.send(image, channel);
    };
    const sendRegularFile = async (file: File) => {
      const content = new FileContent(file, file.name, extOf(file.name), file.size);
      attachReplyOnce(content);
      await WKSDK.shared().chatManager.send(content, channel);
    };

    try {
      for (const b of blocks) {
        if (b.type === "text") {
          const content = new MessageText(b.text);
          const hasMention = isMentionable && (b.all || b.humans || b.ais || b.uids.length > 0);
          if (hasMention) {
            // SDK Mention 类只定义 all/uids;humans/ais 是三态扩展,JSON 序列化时透传给服务端。
            const m = new ImMention() as ImMention & { humans?: number; ais?: number };
            if (b.all) m.all = true;
            if (b.uids.length > 0) m.uids = b.uids;
            if (b.humans) m.humans = 1;
            if (b.ais) m.ais = 1;
            content.mention = m;
          }
          attachReplyOnce(content);
          await WKSDK.shared().chatManager.send(content, channel);
        } else if (b.type === "image") {
          await sendImageFile(b.file);
        } else {
          await sendRegularFile(b.file);
        }
      }
      for (const item of top) {
        if (isImageMime(item.type, item.name)) {
          await sendImageFile(item.file);
        } else if (isVideoMime(item.type, item.name)) {
          // 视频走文件路径(SDK 暂未实装专门 video content);UI 上 generateVideoCover 仅作封面
          await sendRegularFile(item.file);
        } else {
          await sendRegularFile(item.file);
        }
      }
      editor.commands.clearContent();
      attachments.clearAll();
      chatReplyActions.clear(channel);
      dropDraft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  };

  useSyncSendRef(send, sendRef);

  const transcribeAndInsert = async (file: File) => {
    setTranscribing(true);
    try {
      const { text } = await transcribeVoice(file, { channelType: channel.channelType });
      if (text && editor) {
        editor.chain().focus().insertContent(text).run();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "转写失败");
    } finally {
      setTranscribing(false);
    }
  };

  const voiceRec = useVoiceRecorder({
    maxDuration: VOICE_MAX_DURATION,
    onError: (e) => toast.error(e.message || "录音失败"),
    onAutoStop: () => {
      void (async () => {
        const file = await voiceRec.stop(false);
        if (file) await transcribeAndInsert(file);
      })();
    },
  });

  useVoiceShortcut(
    voiceRec.isRecording,
    transcribing,
    () => void voiceRec.start(),
    () => {
      void (async () => {
        const file = await voiceRec.stop(false);
        if (file) await transcribeAndInsert(file);
      })();
    },
    () => void voiceRec.stop(true),
  );

  const onClickMic = async () => {
    if (transcribing) return;
    if (!voiceRec.isRecording) {
      await voiceRec.start();
      return;
    }
    const file = await voiceRec.stop(false);
    if (file) await transcribeAndInsert(file);
  };

  const onClickMention = () => {
    if (!isMentionable || !editor) return;
    editor.chain().focus().insertContent("@").run();
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (slash.isOpen()) return;
    void send();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length > 0) void attachments.addAttachments(files, "upload", editor);
  };

  // 粘贴:图片走 paste(inline editor),非图走 upload(顶部);文本/HTML 不拦截。
  const onPaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    const others: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== "file") continue;
      const f = it.getAsFile();
      if (!f) continue;
      if (it.type.startsWith("image/")) images.push(f);
      else others.push(f);
    }
    if (images.length === 0 && others.length === 0) return;
    e.preventDefault();
    if (images.length > 0) void attachments.addAttachments(images, "paste", editor);
    if (others.length > 0) void attachments.addAttachments(others, "upload", editor);
  };

  // 拖文件:全部走 upload(顶部,对齐旧版)
  const onDrop = (e: React.DragEvent<HTMLFormElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    void attachments.addAttachments(files, "upload", editor);
  };

  const onDragOver = (e: React.DragEvent<HTMLFormElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
    }
  };

  const insertEmoji = (native: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(native).run();
    setEmojiOpen(false);
  };

  const replyDigest = replyingTo
    ? ((replyingTo.content as { conversationDigest?: string } | undefined)?.conversationDigest ??
      "")
    : "";
  const replySender = replyingTo ? fromName(replyingTo.fromUID) : "";
  const replyTypeMeta = quotedTypeMeta(replyingTo?.content);

  const micRecording = voiceRec.isRecording;
  const micTitle = transcribing
    ? "正在听写..."
    : micRecording
      ? `录音中 ${formatRecordTime(voiceRec.duration)}`
      : `语音输入(Shift+${META_KEY}+Space)`;

  return (
    <div className="shrink-0 px-4 pb-2">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`relative flex w-full cursor-text flex-col rounded-xl border border-border-default/40 bg-bg-surface px-4 py-2 transition-colors focus-within:border-text-primary ${expanded ? "min-h-[280px]" : "min-h-10"}`}
      >
        {replyingTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-sm bg-bg-elevated px-3 py-1.5 text-[14px] leading-tight">
            <button
              type="button"
              onClick={() => chatReplyActions.clear(channel)}
              aria-label="取消回复"
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-text-tertiary text-bg-surface transition-colors hover:bg-text-secondary"
            >
              <X size={8} strokeWidth={3} />
            </button>
            <span className="h-3 w-px shrink-0 bg-border-default" />
            <div className="flex min-w-0 flex-1 items-center gap-1 text-text-secondary">
              <span className="shrink-0">回复</span>
              <span className="shrink-0 font-medium text-text-primary">{replySender}:</span>
              {replyTypeMeta.Icon ? <replyTypeMeta.Icon size={12} className="shrink-0" /> : null}
              <span className="truncate">
                {replyTypeMeta.hint ? `${replyTypeMeta.hint} ` : ""}
                {replyDigest}
              </span>
            </div>
          </div>
        ) : null}

        {/* 顶部附件区(对齐旧 .wk-messageinput-top-attachments) */}
        <ComposerTopAttachmentBar
          items={attachments.topAttachments}
          onRemove={attachments.removeTopAttachment}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChange} />

        <div className="flex items-center gap-2">
          <div className={`min-w-0 flex-1 ${expanded ? "max-h-[240px] overflow-y-auto" : ""}`}>
            <EditorContent editor={editor} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              aria-label="表情"
              title="表情"
              className={`flex h-6 w-6 items-center justify-center transition-colors ${
                emojiOpen ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
              }`}
            >
              <Smile size={20} />
            </button>
            {isMentionable ? (
              <button
                type="button"
                onClick={onClickMention}
                aria-label="@提及"
                title="@提及"
                className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
              >
                <AtSign size={20} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="发送文件"
              title="发送文件 / 图片"
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              <Paperclip size={20} />
            </button>
            <button
              type="button"
              onClick={() => toast.info("创建任务功能即将接入(P3+)")}
              aria-label="创建任务"
              title={`创建任务(${ALT_KEY}+↵)`}
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              <CheckSquare size={20} />
            </button>
            <div className="flex h-6 items-center text-text-tertiary">
              <button
                type="button"
                onClick={() => void onClickMic()}
                aria-label="语音输入"
                title={micTitle}
                disabled={transcribing}
                className={`flex h-6 items-center justify-center gap-1 transition-colors disabled:cursor-not-allowed ${
                  micRecording
                    ? "text-error"
                    : transcribing
                      ? "text-text-tertiary"
                      : "text-text-tertiary hover:text-text-primary"
                }`}
              >
                {transcribing ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : micRecording ? (
                  <>
                    <MicOff size={20} className="animate-pulse" />
                    <span className="text-[11px] tabular-nums">
                      {formatRecordTime(voiceRec.duration)}
                    </span>
                  </>
                ) : (
                  <Mic size={20} />
                )}
              </button>
              <button
                type="button"
                onClick={() => toast.info("语音模式选择即将接入(P3+)")}
                aria-label="语音模式"
                title="语音模式"
                disabled={micRecording || transcribing}
                className="flex h-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "收起" : "展开"}
              title={expanded ? "收起" : "展开"}
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </div>

        <SlashCommandMenu
          commands={botCommands}
          filter={slash.state.filter}
          visible={slash.state.visible}
          activeIndex={slash.state.activeIndex}
          onSelect={slash.handleSelect}
        />

        <EmojiPickerPopover
          open={emojiOpen}
          containerRef={formRef}
          onSelect={insertEmoji}
          onClose={() => setEmojiOpen(false)}
        />
      </form>
    </div>
  );
}

// send 变化时重指 sendRef,让 keymap 闭包永远拿最新引用。
function useSyncSendRef(send: () => void | Promise<void>, ref: React.MutableRefObject<() => void>) {
  useEffect(() => {
    ref.current = () => {
      void send();
    };
  }, [send, ref]);
}

// 把最新 fn 同步进 ref(满足 no-useeffect-in-component;给 slash 等闭包稳定的回调用)。
function useSyncRef<T>(ref: React.MutableRefObject<T>, value: T) {
  useEffect(() => {
    ref.current = value;
  }, [ref, value]);
}
