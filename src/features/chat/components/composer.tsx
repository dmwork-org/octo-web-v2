import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { Extension, type Editor } from "@tiptap/core";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  Mention as ImMention,
  MessageContentType,
  MessageImage,
  MessageText,
  Reply,
  type Subscriber,
  type MessageContent,
} from "wukongimjssdk";
import { useStore } from "@tanstack/react-store";
import {
  AtSign,
  CheckSquare,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Mic,
  Paperclip,
  Smile,
  X,
} from "lucide-react";
import { message } from "@/components/ui/message";
import { safeAiServiceText } from "@/features/chat/lib/ai-error-message";
import { EmojiPickerPopover } from "@/features/chat/components/emoji-picker-popover";
import { SlashCommandMenu } from "@/features/chat/components/slash-command-menu";
import { ComposerTopAttachmentBar } from "@/features/chat/components/composer-top-attachment-bar";
import { FileContent } from "@/features/base/im/file-content";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authStore } from "@/features/base/stores/auth";
import { transcribeVoice, type VoiceMode } from "@/features/base/api/endpoints/voice.api";
import { VoiceButtonGroup } from "@/features/chat/components/voice-button-group";
import { VoiceFloatingIndicator } from "@/features/chat/components/voice-floating-indicator";
import {
  chatReplyActions,
  chatReplyStore,
  selectReplyForChannel,
} from "@/features/chat/stores/chat-reply";
import { createMentionSuggestion } from "@/features/chat/components/mention-suggestion";
import type { MentionItem } from "@/features/chat/components/mention-list";
import { useComposerDraft } from "@/features/chat/hooks/use-composer-draft.hook";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { useVoiceRecorder } from "@/features/chat/hooks/use-voice-recorder.hook";
import { useVoiceShortcut } from "@/features/chat/hooks/use-voice-shortcut.hook";
import { useApplyPendingMention } from "@/features/chat/hooks/use-apply-pending-mention.hook";
import { useApplyReeditRequest } from "@/features/chat/hooks/use-apply-reedit-request.hook";
import { useReopenMentionPopupOnSubscribersReady } from "@/features/chat/hooks/use-reopen-mention-popup.hook";
import { useDispatchOnPlaceholderChange } from "@/features/chat/hooks/use-reactive-tiptap-placeholder.hook";
import { lookupNicknameLabel } from "@/features/chat/lib/reply-to-message";
import { wrapSendContentForInjection } from "@/features/base/im/send-content-proxy";
import { spaceStore } from "@/features/base/stores/space";
import { useBotCommands } from "@/features/chat/hooks/use-bot-commands.hook";
import { useSlashCommand } from "@/features/chat/hooks/use-slash-command.hook";
import { useEditorMultiline } from "@/features/chat/hooks/use-editor-multiline.hook";
import { useComposerAttachments } from "@/features/chat/hooks/use-composer-attachments.hook";
import { usePendingAttachmentGuard } from "@/features/chat/hooks/use-pending-attachment-guard.hook";
import { AttachmentNode } from "@/features/chat/lib/composer-attachment-node";
import { quotedReplyPreviewText } from "@/features/chat/lib/quoted-reply-preview";
import { isImageMime, isVideoMime, splitClipboardFiles } from "@/features/chat/lib/composer-files";
import { precheckUploadCredentials } from "@/features/chat/services/upload-preflight";
import { extractOctoRichTextClipboardPayloadFromHtml } from "@/features/chat/lib/rich-text-clipboard";
import { restoreOctoRichTextClipboardToEditor } from "@/features/chat/lib/rich-text-paste";
import { handleSecretPaste } from "@/features/chat/lib/secret-paste-detect";
import { dispatchOpenSecrets } from "@/features/base/events/secrets-events";
import {
  buildVoiceContext,
  buildVoiceMentionMembers,
  type MentionMemberSource,
} from "@/features/chat/lib/mention-resolve";
import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
  MENTION_UID_LEGACY_ALL,
  MENTION_UID_OLD_ALL_ALIAS,
} from "@/features/base/lib/mention-three-state";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

/** ChannelType 7 = ChannelTypeCommunityTopic;子区也走 mention(成员=父群成员)。 */
const CHANNEL_TYPE_THREAD = 5;

/** 录音上限(秒)— 对齐旧 PRD;到时自动 stop 触发转写。 */
const VOICE_MAX_DURATION = 60;

/** Mac 上 Option/Alt 显示 ⌥,其他平台显示 Alt(对齐旧 ALT_KEY)。 */
const ALT_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌥" : "Alt";

const STICKY_MENTIONS: MentionItem[] = [
  { id: MENTION_UID_HUMANS, label: MENTION_LABEL_HUMANS },
  { id: MENTION_UID_AIS, label: MENTION_LABEL_AIS, isBot: true },
];

interface ComposerProps {
  channel: Channel;
  /**
   * 顶部 banner 文案(如已归档子区的"发送后会恢复活跃"提示)。
   * 对齐上游 23b59a41 archivedInputNotice — 在 input 上方展示一行提示。
   */
  inputNotice?: string;
  /**
   * 消息发送成功后回调(每条消息发送完都调一次)。
   * DetailView 用它在 archived 子区发消息后 invalidate thread query,
   * 让后端把 status 从 Archived 自动 reactivate 回 Active 后 UI 同步。
   */
  onMessageSent?: () => void;
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

function quotedTypeMeta(
  tt: (key: string, opts?: { values?: Record<string, string> }) => string,
  content: MessageContent | undefined,
): {
  Icon: typeof ImageIcon | null;
  hint: string;
} {
  const ct = (content as { contentType?: number } | undefined)?.contentType;
  if (ct === MessageContentType.image)
    return { Icon: ImageIcon, hint: tt("composer.quoted.image") };
  if (ct === MessageContentType.text) return { Icon: null, hint: "" };
  if (ct === 6) return { Icon: FileText, hint: tt("composer.quoted.file") };
  if (ct === 4) return { Icon: Mic, hint: tt("composer.quoted.voice") };
  return { Icon: null, hint: "" };
}

function buildPlaceholder(
  tt: (key: string, opts?: { values?: Record<string, string> }) => string,
  channel: Channel,
  name: string,
): string {
  if (channel.channelType === ChannelTypePerson) {
    return name
      ? tt("composer.placeholder.directWithName", { values: { name } })
      : tt("composer.placeholder.direct");
  }
  return name
    ? tt("composer.placeholder.replyWithName", { values: { name, alt: ALT_KEY } })
    : tt("composer.placeholder.reply", { values: { alt: ALT_KEY } });
}

function subscriberMentionSource(sub: Subscriber): MentionMemberSource {
  const orgData = sub.orgData as MentionMemberSource["orgData"];
  return {
    uid: sub.uid,
    name: sub.name,
    remark: sub.remark,
    isDeleted: sub.isDeleted,
    orgData,
  };
}

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

export function Composer({ channel, inputNotice, onMessageSent }: ComposerProps) {
  const tt = useT();
  const [, setSending] = useState(false);
  /** sending 的 ref 镜像，绕过闭包陷阱，finally 中重放时读取最新值。 */
  const sendingRef = useRef(false);
  /** 快速连发缓冲：sending 为 true 时把编辑器 HTML 快照入队，finally 中自动重放。 */
  const pendingSendsRef = useRef<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const replyingTo = useStore(chatReplyStore, (s) => selectReplyForChannel(s, channel));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isMentionable = isGroup || isThread;

  const authUser = useStore(authStore, (s) => s.user);
  const myUid = authUser?.uid ?? "";
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const subscribers = useGroupSubscribers(channel, isMentionable);
  // 订阅 channelInfo 推送 — reply digest 内 lookupNicknameLabel 依赖 SDK 缓存,
  // fetchChannelInfo 到位后通过 tick 触发重渲拿到 sender 名(issue #76)。
  useChannelInfoTick();
  const botCommands = useBotCommands(channel);
  const attachments = useComposerAttachments();
  const editorRef = useRef<Editor | null>(null);
  const addAttachmentsRef = useRef(attachments.addAttachments);
  addAttachmentsRef.current = attachments.addAttachments;
  const addClipboardFiles = (clipboardData: DataTransfer | null): boolean => {
    const { images, others } = splitClipboardFiles(clipboardData?.items);
    if (images.length === 0 && others.length === 0) return false;
    if (images.length > 0) void addAttachmentsRef.current(images, "paste", editorRef.current);
    if (others.length > 0) void addAttachmentsRef.current(others, "upload", editorRef.current);
    return true;
  };
  const mentionSourcesRef = useRef<MentionMemberSource[]>([]);
  mentionSourcesRef.current = subscribers.map((s) => subscriberMentionSource(s));

  const channelName = (() => {
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    return info?.title ?? "";
  })();
  const placeholder = buildPlaceholder(tt, channel, channelName);
  // ref + 回调式 placeholder:Placeholder extension 在 useEditor 配置时
  // 捕获字符串到 plugin 闭包,React 重渲传新字符串不生效。改为 callback,
  // 每次 decoration 重算时调函数读最新值(由 useDispatchOnPlaceholderChange
  // 触发 view 重算)。render-time 同步 ref 保证 useEditor 首次 mount 时
  // 也能拿到当前 locale 文案。
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  const memberCandidates = useMemo<MentionItem[]>(() => {
    if (!isMentionable) return [];
    return subscribers
      .filter((s) => s.uid !== myUid && !s.isDeleted)
      .map((s) => {
        const og = s.orgData as
          | { robot?: number; home_space_id?: string; home_space_name?: string }
          | undefined;
        // 外部成员判定:成员 orgData.home_space_id 与当前 Space 不一致 → 外部。
        // home_space_id 来源:membersync 后端透传(GroupMemberRaw [key:string]:unknown)。
        // 缺失时 fallback 到 person channelInfo 缓存(channelInfoCallback 写入)。
        let memberSpaceId = og?.home_space_id;
        let memberSpaceName = og?.home_space_name;
        if (!memberSpaceId) {
          const personInfo = WKSDK.shared().channelManager.getChannelInfo(
            new Channel(s.uid, ChannelTypePerson),
          );
          const personOrgData = personInfo?.orgData as
            | { home_space_id?: string; home_space_name?: string }
            | undefined;
          memberSpaceId = personOrgData?.home_space_id;
          memberSpaceName = memberSpaceName ?? personOrgData?.home_space_name;
        }
        const isExternal = !!spaceId && !!memberSpaceId && memberSpaceId !== spaceId;
        return {
          id: s.uid,
          label: s.remark || s.name || s.uid,
          isBot: og?.robot === 1,
          isExternal,
          externalSpaceName: isExternal ? memberSpaceName : undefined,
        };
      });
  }, [subscribers, myUid, isMentionable, spaceId]);

  const voiceContext = useMemo(
    () =>
      isMentionable
        ? buildVoiceContext({
            members: subscribers.map((s) => subscriberMentionSource(s)),
            selfUid: myUid,
            selfName: authUser?.name,
          })
        : { selfName: authUser?.name },
    [authUser?.name, isMentionable, myUid, subscribers],
  );

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
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
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
              suggestion: createMentionSuggestion((query) => {
                const kw = query.toLowerCase();
                const list = candidatesRef.current;
                // 私聊不显 sticky 广播项(对齐上游 ff46fa58:私聊里 @所有人/@所有AI 无意义)
                const stickyForChannel =
                  channel.channelType === ChannelTypePerson ? [] : STICKY_MENTIONS;
                // **不截断列表**(issue #92):MentionList 自身 max-h-[220px] overflow-y-auto
                // 可滚动展示全部候选,对齐老仓 buildMentionDropdownItems(不 slice)。
                // 此前 `.slice(0, 8)` 会把排序靠后的 bot 切掉(成员排序按 role,bot 通常
                // 不是 owner 会被排到后段),空 @ 触发列表里 bot 不全;输入关键字 filter
                // 命中仍能搜到,符合用户描述"@搜索能搜到"。
                if (!kw) return [...stickyForChannel, ...list];
                return list.filter(
                  (c) => c.label.toLowerCase().includes(kw) || c.id.toLowerCase().includes(kw),
                );
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
      handleKeyDown: (_view, event) => {
        if (slashKeyDownRef.current(event)) return true;
        if (event.key === "Enter" && event.altKey && !event.shiftKey) {
          event.preventDefault();
          window.dispatchEvent(
            new CustomEvent("chat:create-matter-from-composer", {
              detail: { channelId: channel.channelID, channelType: channel.channelType },
            }),
          );
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (addClipboardFiles(event.clipboardData)) {
          event.preventDefault();
          return true;
        }

        const pastedText = event.clipboardData?.getData("text/plain") ?? "";
        const blockedSecret = handleSecretPaste(pastedText, (value) => {
          message.warning(t("base.secrets.pasteGuard.content"), {
            key: "secret-paste-guard",
            duration: 8000,
            action: {
              label: t("base.secrets.pasteGuard.action"),
              onClick: () => dispatchOpenSecrets({ create: true, value }),
            },
          });
        });
        if (blockedSecret) {
          event.preventDefault();
          return true;
        }

        const payload = extractOctoRichTextClipboardPayloadFromHtml(
          event.clipboardData?.getData("text/html") || "",
        );
        const currentEditor = editorRef.current;
        if (!payload || !currentEditor) return false;

        event.preventDefault();
        const beforePasteContent = JSON.stringify(currentEditor.getJSON());
        restoreOctoRichTextClipboardToEditor(
          payload,
          currentEditor,
          (files, source, ed) => addAttachmentsRef.current(files, source, ed),
          mentionSourcesRef.current,
        ).catch(() => {
          if (payload.plain && JSON.stringify(currentEditor.getJSON()) === beforePasteContent) {
            currentEditor.commands.insertContent(payload.plain);
          }
        });
        return true;
      },
      transformPastedHTML: (html) => {
        // P0 XSS #167: 浏览器在 ProseMirror schema 解析前就创建 DOM 并触发 onerror，
        // 这里只 strip on* 属性和危险标签，不做白名单——标签过滤交给 ProseMirror schema
        if (!html) return html;
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("script, iframe, object, embed").forEach((el) => el.remove());
        doc.querySelectorAll("*").forEach((el) => {
          for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
          }
        });
        return doc.body.innerHTML;
      },
    },
  });
  editorRef.current = editor;

  const slash = useSlashCommand(editor, botCommands);
  const isMultiLine = useEditorMultiline(editor);
  useSyncRef(slashKeyDownRef, slash.handleKeyDown);
  useSyncRef(slashIsOpenRef, slash.isOpen);

  const { clearDraft: dropDraft } = useComposerDraft(editor, channel);

  useApplyPendingMention(channel, editor);
  useApplyReeditRequest(channel, editor, attachments.addAttachments);
  // issue #117:subs 拉到位时让仍开着的 sticky-only mention popup 重开拿全 list
  useReopenMentionPopupOnSubscribersReady(editor, subscribers.length);
  useDispatchOnPlaceholderChange(editor, placeholder);

  usePendingAttachmentGuard(editor, attachments.hasAnyAttachment);

  // 不 memo — fromName 来自 SDK channelInfo cache,channelInfoListener 推送后
  // 需重算(issue #76)。useChannelInfoTick 保证 cache 变化触发重渲,这里
  // 顺便重新构造 Reply。send() 调用时立即拿当前值,不持有跨渲染引用。
  const buildReply = () => {
    if (!replyingTo) return undefined;
    const r = new Reply();
    r.messageID = replyingTo.messageID;
    r.messageSeq = replyingTo.messageSeq;
    r.fromUID = replyingTo.fromUID;
    r.fromName = lookupNicknameLabel(channel, replyingTo.fromUID);
    r.content = replyingTo.content;
    return r;
  };

  const send = async () => {
    if (!editor) return;
    // ws 未连接时阻止发送，保留编辑器内容，避免消息静默丢失（#202）
    if (!WKSDK.shared().connectManager.connected()) {
      message.warning(t("composer.toast.sendFailed"));
      return;
    }
    if (sendingRef.current) {
      // 缓冲：把当前编辑器内容快照入队，当前发送完成后自动重放。
      // 不再 toast warning + 丢弃（GH#176 快速连发消息丢失）。
      const html = editor.getHTML();
      if (html && html !== "<p></p>") {
        pendingSendsRef.current.push(html);
        editor.commands.clearContent();
      }
      return;
    }

    // 预校验：在占锁之前检查消息合法性，保证校验通过前锁是干净的
    const MAX_MESSAGE_LENGTH = 5000;
    const blocks = attachments.extractOrderedBlocks(editor);
    const top = attachments.topAttachments;
    const hasText = blocks.some((b) => b.type === "text" && b.text?.trim());
    const hasAttach = blocks.some((b) => b.type !== "text") || top.length > 0;
    if (!hasText && !hasAttach) return;

    for (const b of blocks) {
      if (b.type === "text" && b.text.length > MAX_MESSAGE_LENGTH) {
        message.error(t("composer.toast.tooLong", { values: { max: MAX_MESSAGE_LENGTH } }));
        return;
      }
    }

    // 立即占锁，防止后续 send() 在 await 期间穿透 guard（GH#176）
    sendingRef.current = true;
    setSending(true);

    const wrapInject = (c: MessageContent) => {
      const m = (c as { mention?: { humans?: number; ais?: number } }).mention;
      return wrapSendContentForInjection(c, {
        spaceId: channel.channelType === ChannelTypePerson ? spaceId : null,
        mentionHumans: !!m?.humans,
        mentionAis: !!m?.ais,
      });
    };

    // VoiceFeedback uploadFinal(对齐上游 c0a6f1ea submitAll):用户实际发送的文本
    // 跟之前 ASR modelText 配对上报,server 评估识别准确率。disabled 时 no-op。
    try {
      const { VoiceFeedback } = await import("@/features/chat/services/voice-feedback");
      VoiceFeedback.shared()?.submitAll(editor?.getText() ?? "");
    } catch {
      /* feedback 失败不影响 send */
    }

    let isFirst = true;
    const attachReplyOnce = (c: MessageContent) => {
      if (!isFirst) return;
      const r = buildReply();
      if (r) (c as { reply?: Reply }).reply = r;
      isFirst = false;
    };

    const sendImageFile = async (file: File): Promise<boolean> => {
      try {
        await precheckUploadCredentials(file, channel, extOf(file.name));
      } catch (err) {
        message.error(`图片「${file.name}」${(err as Error).message}`);
        return false;
      }
      const { width, height } = await readImageSize(file);
      const image = new MessageImage(file, width, height);
      attachReplyOnce(image);
      await WKSDK.shared().chatManager.send(wrapInject(image), channel);
      return true;
    };
    const sendRegularFile = async (file: File): Promise<boolean> => {
      try {
        await precheckUploadCredentials(file, channel, extOf(file.name));
      } catch (err) {
        message.error(`文件「${file.name}」${(err as Error).message}`);
        return false;
      }
      const content = new FileContent(file, file.name, extOf(file.name), file.size);
      attachReplyOnce(content);
      await WKSDK.shared().chatManager.send(wrapInject(content), channel);
      return true;
    };

    /**
     * RichText=14 聚合发送(对齐上游 b5a3b68e):editor 内同时有 text + image
     * 且无 file blocks 时,合并成单个 type=14 payload(blocks 顺序保持图文穿插)。
     * 顶部附件区(top)不参与聚合,继续走独立发送路径。
     *
     * 每张图先 uploadChatMedia 拿 downloadUrl → isSafeUrl 校验(防止 javascript:/data:
     * 等不安全 scheme 注入到 wire payload)→ 不安全或上传失败的图 skip + toast。
     * mention 合并:所有 text blocks 的 all/humans/ais/uids 取并集挂在单个消息上,
     * 保证 @所有AI / @所有人 / @某人 不丢。
     */
    const sendRichTextMixed = async (
      ords: ReturnType<typeof attachments.extractOrderedBlocks>,
    ): Promise<boolean> => {
      const { uploadChatMedia, isSafeUrl } =
        await import("@/features/chat/services/upload-chat-media");
      const { makeTextBlock, makeImageBlock, createRichTextContent } =
        await import("@/features/base/im/richtext-content");
      const rtBlocks: import("@/features/base/im/richtext-content").RichTextBlock[] = [];
      const merged = { all: false, humans: 0, ais: 0, uids: new Set<string>() };
      for (const b of ords) {
        if (b.type === "text") {
          if (b.text) rtBlocks.push(makeTextBlock(b.text));
          if (b.all) merged.all = true;
          if (b.humans) merged.humans = 1;
          if (b.ais) merged.ais = 1;
          for (const uid of b.uids) merged.uids.add(uid);
        } else if (b.type === "image") {
          try {
            const { width, height } = await readImageSize(b.file);
            const url = await uploadChatMedia(b.file, channel, extOf(b.file.name));
            if (!isSafeUrl(url)) {
              message.error(`图片「${b.file.name}」URL 校验失败`);
              continue;
            }
            rtBlocks.push(
              makeImageBlock({ url, width, height, size: b.file.size, name: b.file.name }),
            );
          } catch (err) {
            message.error(`图片「${b.file.name}」${(err as Error).message}`);
          }
        }
      }
      if (rtBlocks.length === 0) return false;
      const content = createRichTextContent(rtBlocks);
      // mention 合并(同纯文本路径,@所有AI 时把 bot uid 列进 mention.uids,GH#100)
      if (isMentionable && (merged.all || merged.humans || merged.ais || merged.uids.size > 0)) {
        const m = new ImMention() as ImMention & { humans?: number; ais?: number };
        if (merged.all) m.all = true;
        if (merged.humans) m.humans = 1;
        if (merged.ais) {
          m.ais = 1;
          for (const uid of candidatesRef.current.filter((c) => c.isBot).map((c) => c.id)) {
            merged.uids.add(uid);
          }
        }
        if (merged.uids.size > 0) m.uids = [...merged.uids];
        (content as MessageContent & { mention?: ImMention }).mention = m;
      }
      attachReplyOnce(content);
      await WKSDK.shared().chatManager.send(wrapInject(content), channel);
      return true;
    };

    try {
      const editorHasText = blocks.some((b) => b.type === "text" && b.text);
      const editorHasImage = blocks.some((b) => b.type === "image");
      const editorHasFile = blocks.some((b) => b.type === "file");
      const shouldAggregateRichText = editorHasText && editorHasImage && !editorHasFile;

      if (shouldAggregateRichText) {
        await sendRichTextMixed(blocks);
      } else {
        for (const b of blocks) {
          if (b.type === "text") {
            const content = new MessageText(b.text);
            const hasMention = isMentionable && (b.all || b.humans || b.ais || b.uids.length > 0);
            if (hasMention) {
              const m = new ImMention() as ImMention & { humans?: number; ais?: number };
              if (b.all) m.all = true;
              const uids = [...b.uids];
              if (b.humans) m.humans = 1;
              if (b.ais) {
                m.ais = 1;
                // GH#100(对齐上游 405bbe98):@所有AI 时把 bot uid 列进 mention.uids,
                // 让只识别 mention.uids 不识别 mention.ais 的 legacy adapter bot 也能收到。
                // 客户端发消息走 WuKongIM SDK 直传(不走后端 REST),server 侧的 ais 展开
                // (octo-server PR#145)对客户端发送的消息无效。
                const botUids = candidatesRef.current
                  .filter((m) => m.isBot)
                  .map((m) => m.id)
                  .filter((uid) => !uids.includes(uid));
                if (botUids.length > 0) uids.push(...botUids);
              }
              if (uids.length > 0) m.uids = uids;
              content.mention = m;
            }
            attachReplyOnce(content);
            await WKSDK.shared().chatManager.send(wrapInject(content), channel);
          } else if (b.type === "image") {
            await sendImageFile(b.file);
          } else {
            await sendRegularFile(b.file);
          }
        }
      }
      for (const item of top) {
        if (isImageMime(item.type, item.name)) {
          await sendImageFile(item.file);
        } else if (isVideoMime(item.type, item.name)) {
          await sendRegularFile(item.file);
        } else {
          await sendRegularFile(item.file);
        }
      }
      editor.commands.clearContent();
      attachments.clearAll();
      chatReplyActions.clear(channel);
      dropDraft();
      onMessageSent?.();
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("composer.toast.sendFailed"));
    } finally {
      sendingRef.current = false;
      setSending(false);
      // 重放缓冲队列（GH#176 快速连发消息丢失）
      const pending = pendingSendsRef.current.shift();
      if (pending) {
        editor?.commands.setContent(pending);
        // 下一帧触发 send，避免在 finally 中递归调用。
        // sendingRef 已置 false，重放的 send() 不会再次命中 guard。
        queueMicrotask(() => {
          void send();
        });
      }
    }
  };

  useSyncSendRef(send, sendRef);

  const transcribeAndInsert = async (file: File, mode: VoiceMode) => {
    setTranscribing(true);
    try {
      const contextText = mode === "edit_only" ? (editor?.getText() ?? "") : undefined;
      const result = await transcribeVoice(file, {
        channelType: channel.channelType,
        contextText,
        memberContext: voiceContext.memberContext,
        selfName: voiceContext.selfName,
        mode,
      });
      const text = result.text;

      // VoiceFeedback uploadLocal(对齐上游 c0a6f1ea onTranscribeResult):
      // 把这次转写结果记 pending,user 实际发送时 submitAll 会再 uploadFinal 对齐 model/user
      try {
        const { VoiceFeedback } = await import("@/features/chat/services/voice-feedback");
        VoiceFeedback.shared()?.onTranscribeResult({
          utteranceId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          modelText: text,
          source: "remote",
          requestId: result.request_id,
          asrParams: {
            mode,
            channelType: channel.channelType,
            contextText,
            memberContext: voiceContext.memberContext,
            selfName: voiceContext.selfName,
          },
        });
      } catch {
        /* feedback 失败不影响转写流程 */
      }

      if (!text || !editor) return;

      if (mode === "edit_only") {
        editor.chain().focus().clearContent().insertContent(text).run();
        return;
      }
      if (isMentionable) {
        const { parseVoiceMentions } = await import("@/features/chat/lib/voice-mention-parser");
        const members = buildVoiceMentionMembers(
          subscribers
            .filter((s) => s.uid !== myUid && !s.isDeleted)
            .map((s) => subscriberMentionSource(s)),
        );
        const content = parseVoiceMentions(text, members);
        editor
          .chain()
          .focus()
          .insertContent(content as never)
          .run();
      } else {
        editor.chain().focus().insertContent(text).run();
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : t("composer.toast.transcribeFailed"));
    } finally {
      setTranscribing(false);
    }
  };

  const [preparing, setPreparing] = useState(false);
  const [currentMode, setCurrentMode] = useState<VoiceMode>("append_only");
  const currentModeRef = useRef<VoiceMode>("append_only");
  currentModeRef.current = currentMode;

  const voiceRec = useVoiceRecorder({
    maxDuration: VOICE_MAX_DURATION,
    onError: (e) => message.error(e.message || t("composer.toast.recordFailed")),
    onAutoStop: () => {
      void (async () => {
        const file = await voiceRec.stop(false);
        await afterStop(file);
      })();
    },
  });

  const afterStop = async (file: File | null) => {
    if (!file) return;
    if (voiceRec.duration < 1) {
      message.warning(t("composer.toast.noVoiceDetected"));
      return;
    }
    await transcribeAndInsert(file, currentModeRef.current);
  };

  const safeStartVoice = async (mode: VoiceMode) => {
    if (preparing || voiceRec.isRecording) return;
    setCurrentMode(mode);
    setPreparing(true);
    try {
      await voiceRec.start();
    } finally {
      setPreparing(false);
    }
  };

  useVoiceShortcut(
    voiceRec.isRecording,
    transcribing || preparing,
    () => void safeStartVoice("append_only"),
    () => {
      void (async () => {
        const file = await voiceRec.stop(false);
        await afterStop(file);
      })();
    },
    () => void voiceRec.stop(true),
    formRef,
  );

  const onClickMic = async () => {
    if (transcribing || preparing) return;
    if (!voiceRec.isRecording) {
      await safeStartVoice("append_only");
      return;
    }
    const file = await voiceRec.stop(false);
    await afterStop(file);
  };

  const onModeSelect = (mode: VoiceMode) => {
    if (transcribing || preparing || voiceRec.isRecording) return;
    void safeStartVoice(mode);
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

  const onPaste = (e: React.ClipboardEvent<HTMLFormElement>) => {
    if (!addClipboardFiles(e.clipboardData)) return;
    e.preventDefault();
  };

  const onDrop = (e: React.DragEvent<HTMLFormElement>) => {
    const items = Array.from(e.dataTransfer?.items ?? []);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    // 对齐上游 bbac229d:浏览器拖文件夹时 dataTransfer.files 会塞 type=""/size=0
    // 的伪 File,旧路径直接当附件上传会出"幽灵消息"(UI 显已发送但 server 没存)。
    // 主路径用 webkitGetAsEntry().isDirectory 检测,兜底用 type==""/size===0。
    const hasDirectory = items.length
      ? items.some((it) => {
          const entry = (
            it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }
          ).webkitGetAsEntry?.();
          return entry ? entry.isDirectory : false;
        })
      : files.some((f) => f.type === "" && f.size === 0);
    if (hasDirectory) {
      message.error(t("composer.toast.folderUnsupported"));
      return;
    }
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
    ? safeAiServiceText(
        (replyingTo.content as { conversationDigest?: string } | undefined)?.conversationDigest ??
          "",
        tt("message.aiServiceUnavailable"),
      )
    : "";
  const replySender = replyingTo ? lookupNicknameLabel(channel, replyingTo.fromUID) : "";
  const replyTypeMeta = quotedTypeMeta(tt, replyingTo?.content);
  const replyPreviewText = quotedReplyPreviewText(replyTypeMeta.hint, replyDigest);

  const voiceState: "idle" | "preparing" | "recording" | "transcribing" = transcribing
    ? "transcribing"
    : preparing
      ? "preparing"
      : voiceRec.isRecording
        ? "recording"
        : "idle";
  const modeLabel =
    currentMode === "edit_only" ? tt("composer.modeEdit") : tt("composer.modeInput");
  const micTitle =
    voiceState === "transcribing"
      ? currentMode === "edit_only"
        ? tt("composer.editing")
        : tt("composer.transcribing")
      : voiceState === "preparing"
        ? tt("composer.preparing")
        : voiceState === "recording"
          ? tt("composer.clickToStop", { values: { mode: modeLabel } })
          : tt("composer.voiceInputHint");

  return (
    <div className="shrink-0 px-4 pb-2">
      {inputNotice ? (
        <div className="mb-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-text-secondary">
          {inputNotice}
        </div>
      ) : null}
      <form
        ref={formRef}
        onSubmit={onSubmit}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        className={`relative flex w-full cursor-text flex-col rounded-[12px] border border-[#1c1c23]/10 bg-bg-surface px-4 py-2 transition-colors focus-within:border-brand ${expanded ? "min-h-[280px]" : "min-h-10"}`}
      >
        {replyingTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-sm bg-bg-elevated px-3 py-1.5 text-[14px] leading-tight">
            <button
              type="button"
              onClick={() => chatReplyActions.clear(channel)}
              aria-label={tt("composer.cancelReply")}
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-text-tertiary text-bg-surface transition-colors hover:bg-text-secondary"
            >
              <X size={8} strokeWidth={3} />
            </button>
            <span className="h-3 w-px shrink-0 bg-border-default" />
            <div className="flex min-w-0 flex-1 items-center gap-1 text-text-secondary">
              <span className="shrink-0">{tt("composer.replyLabel")}</span>
              <span className="shrink-0 font-medium text-text-primary">{replySender}:</span>
              {replyTypeMeta.Icon ? <replyTypeMeta.Icon size={12} className="shrink-0" /> : null}
              <span className="truncate">{replyPreviewText}</span>
            </div>
          </div>
        ) : null}

        <ComposerTopAttachmentBar
          items={attachments.topAttachments}
          onRemove={attachments.removeTopAttachment}
        />

        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChange} />

        <div className={`flex gap-2 ${isMultiLine ? "flex-col items-stretch" : "items-center"}`}>
          {botCommands.length > 0 && editor ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().setContent("/").run();
                  }}
                  aria-label={tt("composer.slashAria")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full border border-border-default text-base font-semibold text-text-secondary transition-colors hover:border-text-tertiary hover:bg-bg-hover active:bg-bg-elevated"
                >
                  /
                </button>
              </TooltipTrigger>
              <TooltipContent>{tt("composer.slashAria")}</TooltipContent>
            </Tooltip>
          ) : null}
          <div className={`min-w-0 flex-1 ${expanded ? "max-h-[240px] overflow-y-auto" : ""}`}>
            <EditorContent editor={editor} />
          </div>

          <div className={`flex shrink-0 items-center gap-2 ${isMultiLine ? "self-end" : ""}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-label={tt("composer.emojiAria")}
                  className={`flex h-6 w-6 items-center justify-center transition-colors ${
                    emojiOpen ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                  }`}
                >
                  <Smile size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tt("composer.emojiAria")}</TooltipContent>
            </Tooltip>
            {isMentionable ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onClickMention}
                    aria-label={tt("composer.mentionAria")}
                    className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
                  >
                    <AtSign size={20} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tt("composer.mentionAria")}</TooltipContent>
              </Tooltip>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={tt("composer.sendFileAria")}
                  className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
                >
                  <Paperclip size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tt("composer.sendFileTooltip")}</TooltipContent>
            </Tooltip>
            {isMentionable ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("chat:create-matter-from-composer", {
                      detail: {
                        channelId: channel.channelID,
                        channelType: channel.channelType,
                      },
                    }),
                  )
                }
                aria-label={tt("composer.createTaskAria")}
                title={tt("composer.createTaskTitle", { values: { alt: ALT_KEY } })}
                className="flex h-6 w-6 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
              >
                <CheckSquare size={20} />
              </button>
            ) : null}
            <VoiceButtonGroup
              state={voiceState}
              onMicClick={() => void onClickMic()}
              onModeSelect={onModeSelect}
              modeMenuDisabled={transcribing}
              micTitle={micTitle}
            />
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? tt("composer.collapse") : tt("composer.expand")}
              title={expanded ? tt("composer.collapse") : tt("composer.expand")}
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

      {voiceState === "recording" || voiceState === "transcribing" ? (
        <VoiceFloatingIndicator
          state={voiceState}
          label={
            voiceState === "transcribing"
              ? currentMode === "edit_only"
                ? tt("composer.editingShort")
                : tt("composer.transcribingShort")
              : modeLabel
          }
          anchorRef={formRef}
        />
      ) : null}
    </div>
  );
}

function useSyncSendRef(send: () => void | Promise<void>, ref: React.MutableRefObject<() => void>) {
  useEffect(() => {
    ref.current = () => {
      void send();
    };
  }, [send, ref]);
}

function useSyncRef<T>(ref: React.MutableRefObject<T>, value: T) {
  useEffect(() => {
    ref.current = value;
  }, [ref, value]);
}
