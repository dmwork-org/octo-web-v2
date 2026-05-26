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
import {
  AtSign,
  CheckSquare,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Paperclip,
  Smile,
  X,
} from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { EmojiPickerPopover } from "@/features/chat/components/emoji-picker-popover";
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

/** ChannelType 7 = ChannelTypeCommunityTopic;子区也走 mention(成员=父群成员)。 */
const CHANNEL_TYPE_THREAD = 5; // ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts);SDK 1.3.5 7 = ChannelTypeData,不是子区

/** 录音上限(秒)— 对齐旧 PRD;到时自动 stop 触发转写。 */
const VOICE_MAX_DURATION = 60;

/** Mac 上 Option/Alt 显示 ⌥,其他平台显示 Alt(对齐旧 ALT_KEY)。 */
const ALT_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌥" : "Alt";

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

/**
 * 占位符(对齐旧 dmworkbase MessageInput buildPlaceholder):
 *   - person:对 NAME 发送消息  / 发送消息
 *   - group/topic:在 NAME 中回复...  ⌥+↵ 创建任务  / 输入消息...  ⌥+↵ 创建任务
 */
function buildPlaceholder(channel: Channel, name: string): string {
  if (channel.channelType === ChannelTypePerson) {
    return name ? `对 ${name} 发送消息` : "发送消息";
  }
  return name
    ? `在 ${name} 中回复...  ${ALT_KEY}+↵ 创建任务`
    : `输入消息...  ${ALT_KEY}+↵ 创建任务`;
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

function formatRecordTime(sec: number): string {
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Composer(P3-K1/K-2/K-3,TipTap + Mention + 草稿 + 媒体增强 + 1:1 旧 UI):
 *
 * 工具栏布局 1:1 对齐旧 dmworkbase MessageInput(图标全靠右,无 Send 按钮,Enter 发):
 *   [😀 表情] [@ 提及] [📎 文件] [✓ 任务] [🎤▼ 语音] [⤢ 展开]
 *
 * 占位符(对齐旧 buildPlaceholder):
 *   - person:对 NAME 发送消息
 *   - group/topic:在 NAME 中回复...  ⌥+↵ 创建任务
 *
 * 媒体增强:
 * - Emoji 面板:点 😀 弹 emoji 网格 picker(picker 相对 form 左对齐,
 *   不是相对 emoji 按钮 — 旧版同样从输入框左侧弹出)
 * - @ 提及:点 @ 直接 insert "@" 触发 mention picker(仅群/子区)
 * - 粘贴上传:Ctrl+V 粘贴含图片 → sendImage 直传
 * - 拖拽上传:文件拖到 form 区域 → 图片 sendImage / 其他 sendFile
 * - **语音输入**:点 🎤 录音 → POST /voice/transcribe → 文本插入 editor;
 *   ▼ 下拉(P3+ 选 voice mode);**不发送语音消息**
 * - ✓ 任务、⤢ 展开:旧 dmworktodo / dmworkbase 接 — 占位 toast,P3+ 真做
 *
 * Reply 流程(per-channel):
 *   message-row 右键"回复" → chatReplyActions.set(channel, message) →
 *   Composer 顶部按 current channel 取 reply 显示 → 发送时 Reply attach 到 content →
 *   成功 clear(channel) / 用户 ✕ 关掉也 clear(channel)。切走再切回 reply 状态保留。
 */
export function Composer({ channel }: ComposerProps) {
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => selectReplyForChannel(s, channel));
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // form ref:供 EmojiPicker 做 click-outside 判定 + absolute 定位的 relative 锚点
  const formRef = useRef<HTMLFormElement>(null);

  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isMentionable = isGroup || isThread;

  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  // 群成员候选(子区取父群成员;syncSubscribes 异步,改变后 listener 触发重渲)
  const subscribers = useGroupSubscribers(channel, isMentionable);

  // channel 名 — placeholder 用
  const channelName = (() => {
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    return info?.title ?? "";
  })();
  const placeholder = buildPlaceholder(channel, channelName);

  const memberCandidates = useMemo<MentionItem[]>(() => {
    if (!isMentionable) return [];
    const all: MentionItem = { id: "@all", label: "所有人" };
    return [
      all,
      ...subscribers
        // 去自己 + 去已删除;**保留 bot**(robot=1 的 AI 也是合法 @ 对象,只是 UI 加标识)
        .filter((s) => s.uid !== myUid && !s.isDeleted)
        // 显示名优先 remark > name > uid(对齐群里的展示口径);
        // isBot 标记由 mention-list 渲染 AI badge 区分
        .map((s) => {
          const og = s.orgData as { robot?: number } | undefined;
          return {
            id: s.uid,
            label: s.remark || s.name || s.uid,
            isBot: og?.robot === 1,
          };
        }),
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
      Placeholder.configure({ placeholder }),
      ...(isMentionable
        ? [
            Mention.configure({
              HTMLAttributes: {
                // 对齐旧 .wk-messageinput-editor .mention:brand 字色 + bold,无背景
                class: "mx-0.5 font-semibold text-brand",
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
        // 对齐旧 .wk-messageinput-editor .ProseMirror:14px / line-height 20px / max-h 100px
        class:
          "min-h-5 max-h-[100px] overflow-y-auto py-1 text-[14px] leading-5 text-text-primary outline-none",
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

  /** 收到 audio File → POST /voice/transcribe → text 插 editor 当前光标。 */
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
    // 到时自动停 — 走完整 transcribe 流程(让用户听到上限提示后仍能拿到那段文字)
    onAutoStop: () => {
      void (async () => {
        const file = await voiceRec.stop(false);
        if (file) await transcribeAndInsert(file);
      })();
    },
  });

  /**
   * mic 按钮点击:
   *   idle → start 录音
   *   recording → stop + 转写 + 插 editor
   *   transcribing → 锁住,不响应
   */
  const onClickMic = async () => {
    if (transcribing) return;
    if (!voiceRec.isRecording) {
      await voiceRec.start();
      return;
    }
    const file = await voiceRec.stop(false);
    if (file) await transcribeAndInsert(file);
  };

  /** @ 按钮:直接 insert "@",触发 mention picker(仅群/子区)。 */
  const onClickMention = () => {
    if (!isMentionable || !editor) return;
    editor.chain().focus().insertContent("@").run();
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

  /**
   * Ctrl+V 粘贴含图片 → prevent default(阻止 editor 把 image 当 base64 文本插入)+
   * 走 sendImage 直传。多张图依次发。文本/HTML 粘贴不拦截,让 editor 自带 paste 处理。
   */
  const onPaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) images.push(f);
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    for (const f of images) void sendImage(f);
  };

  /** 拖文件到 form 区域 → 图片走 sendImage,其他走 sendFile。多个文件依次发。 */
  const onDrop = (e: React.DragEvent<HTMLFormElement>) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) {
      if (f.type.startsWith("image/")) void sendImage(f);
      else void sendFile(f);
    }
  };

  /** dragover 必须 preventDefault,否则浏览器默认会取消 drop 事件。 */
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

  // mic 三态(对齐旧 useVoiceInput 视觉)
  const micRecording = voiceRec.isRecording;
  const micTitle = transcribing
    ? "正在听写..."
    : micRecording
      ? `录音中 ${formatRecordTime(voiceRec.duration)}`
      : "语音输入";

  return (
    <div className="shrink-0 px-4 pb-2">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        className="relative flex w-full min-h-10 cursor-text flex-col rounded-xl border border-border-default/40 bg-bg-surface px-4 py-2 transition-colors focus-within:border-text-primary"
      >
        {/* Reply 引用条 — 对齐旧 .wk-replyview-new */}
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

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImageChange}
        />
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

        {/* 单行布局(对齐旧版):editor 占满,工具栏靠右。无 Send 按钮(Enter 直发) */}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <EditorContent editor={editor} />
          </div>

          {/* actionbox — 全部图标靠右 24×24 muted hover→primary */}
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
            {/* @ 提及(仅群/子区) */}
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
            {/* 📎 附件(图片+文件,旧版合并为一个图标) */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="发送文件"
              title="发送文件 / 图片"
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              <Paperclip size={20} />
            </button>
            {/* ✓ 创建任务(旧 dmworktodo chattoolbar.matter,占位) */}
            <button
              type="button"
              onClick={() => toast.info("创建任务功能即将接入(P3+)")}
              aria-label="创建任务"
              title={`创建任务(${ALT_KEY}+↵)`}
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              <CheckSquare size={20} />
            </button>
            {/* 🎤▼ 语音输入 + 模式下拉 */}
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
            {/* ⤢ 展开输入框(P3+ 全屏编辑模式,占位) */}
            <button
              type="button"
              onClick={() => toast.info("展开输入框即将接入(P3+)")}
              aria-label="展开"
              title="展开"
              className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>

        {/* Emoji picker — 放在 form 直接子级,absolute 相对 form left-0 弹出
            (而不是相对右上角的 emoji 按钮),与输入框左边对齐,对齐旧 EmojiToolbar 视觉位置。
            click outside 监听 form 整体:点 form 内任何位置(含 emoji 按钮)都不关
            picker,点 form 外才关。*/}
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
