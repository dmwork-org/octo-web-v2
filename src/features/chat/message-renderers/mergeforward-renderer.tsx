import { useEffect, useState } from "react";
import WKSDK, {
  Channel,
  ChannelTypePerson,
  MessageContentType,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { getExtension } from "@/features/chat/file-preview/types";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

interface MergeforwardRendererProps {
  message: Message;
}

const CHANNEL_TYPE_GROUP = 2;
const MAX_NESTED_DEPTH = 10;

type Translator = (key: string, options?: { values?: Record<string, string | number> }) => string;

function buildTitle(content: MergeforwardContent, t: Translator): string {
  if (content.channelType === CHANNEL_TYPE_GROUP) {
    return t("mergeForward.groupChatHistory");
  }
  const names = (content.users ?? []).map((u) => u.name).filter(Boolean);
  if (names.length === 0) return t("mergeForward.chatHistory");
  return t("mergeForward.userChatHistory", { values: { names: names.join("、") } });
}

function senderNameOf(fromUID: string, users: MergeforwardUser[]): string {
  if (!fromUID) return "";
  const hit = users.find((u) => u.uid === fromUID)?.name;
  if (hit) return hit;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  return info?.title || fromUID;
}

function isBotSender(fromUID: string): boolean {
  if (!fromUID) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  return (info?.orgData as { robot?: number } | undefined)?.robot === 1;
}

function formatInnerTime(ts: number, t: Translator): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, now)) return hhmm;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (sameDay(d, y)) return t("mergeForward.yesterdayAt", { values: { time: hhmm } });
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hhmm}`;
}

function usePrefetchSenderInfos(content: MergeforwardContent): void {
  useEffect(() => {
    const mgr = WKSDK.shared().channelManager;
    const seen = new Set<string>();
    for (const m of content.msgs ?? []) {
      if (!m.fromUID || seen.has(m.fromUID)) continue;
      seen.add(m.fromUID);
      const ch = new Channel(m.fromUID, ChannelTypePerson);
      if (!mgr.getChannelInfo(ch)) tryFetchChannelInfo(ch);
    }
  }, [content]);
}

function MergeforwardCard({
  title,
  previewItems,
  onClick,
}: {
  title: string;
  previewItems: string[];
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full max-w-[400px] min-w-[200px] cursor-pointer flex-col rounded-lg border border-[rgba(46,50,56,0.09)] bg-[rgba(28,28,35,0.03)] p-3 text-left transition-colors hover:bg-[rgba(28,28,35,0.05)]"
    >
      <div className="mb-2 truncate text-[14px] font-medium text-[#1c1c23]">{title}</div>
      {previewItems.length > 0 ? (
        <ul className="mb-2.5 flex w-full flex-col gap-1">
          {previewItems.map((text, i) => (
            <li key={i} className="truncate text-[12px] text-[rgba(28,28,35,0.6)]">
              {text}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mb-2.5 h-px w-full bg-[rgba(46,50,56,0.09)]" />
      <div className="text-[12px] text-[rgba(28,28,35,0.35)]">{t("mergeForward.chatHistory")}</div>
    </button>
  );
}

function buildPreview(content: MergeforwardContent): string[] {
  const users = content.users ?? [];
  return (content.msgs ?? []).slice(0, 4).map((m) => {
    const name = senderNameOf(m.fromUID, users);
    const digest = m.content?.conversationDigest ?? "";
    return name ? `${name}：${digest}` : digest;
  });
}

/**
 * 合并转发消息渲染(对齐旧 Messages/Mergeforward + ui/message/MergeforwardCard)。
 *
 * 浮动元素壳层统一规范 Phase C4 — 走 BaseDialog;Radix 自带 portal,删除原手写
 * createPortal(message-row 在 message-list overflow-y-auto 滚动容器内,fixed 会被
 * 父 stacking context trap → 老仓走 createPortal 跳出;BaseDialog 走 Radix Portal,
 * 同样 portal 到 document.body 解决)。
 */
export function MergeforwardRenderer({ message }: MergeforwardRendererProps) {
  const t = useT();
  const root = message.content as MergeforwardContent;
  const [open, setOpen] = useState(false);
  return (
    <>
      <MergeforwardCard
        title={buildTitle(root, t)}
        previewItems={buildPreview(root)}
        onClick={() => setOpen(true)}
      />
      <MergeforwardModal open={open} root={root} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * 聊天记录详情弹窗(对齐旧 .wk-mergeforward-modal + MergeforwardMessageList):
 * - 480 宽 / max-h calc(100vh - 160px)
 * - title:可返回时左侧 ArrowLeft + 文字;X 关闭由 BaseDialog 内置
 * - 嵌套合并转发(type=11)点击 → push contentStack(同 modal 内切换,不开新 Dialog)
 */
function MergeforwardModal({
  open,
  root,
  onClose,
}: {
  open: boolean;
  root: MergeforwardContent;
  onClose: () => void;
}) {
  const t = useT();
  const [stack, setStack] = useState<MergeforwardContent[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1] : root;
  const canGoBack = stack.length > 0;

  usePrefetchSenderInfos(current);

  const pushNested = (c: MergeforwardContent) => {
    if (stack.length >= MAX_NESTED_DEPTH) return;
    setStack((prev) => [...prev, c]);
  };
  const goBack = () => setStack((prev) => prev.slice(0, -1));

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setStack([]);
          onClose();
        }
      }}
      size="fit"
      title={
        <div className="flex min-w-0 items-center gap-2">
          {canGoBack ? (
            <button
              type="button"
              onClick={goBack}
              aria-label={t("mergeForward.back")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <span className="truncate text-base font-medium text-text-primary">
            {buildTitle(current, t)}
          </span>
        </div>
      }
      className="w-[480px] max-h-[calc(100vh_-_160px)]"
      contentClassName="px-4 py-2.5"
    >
      <div key={`stack-${stack.length}`}>
        <MergeforwardList content={current} onOpenNested={pushNested} onClose={onClose} />
      </div>
    </BaseDialog>
  );
}

function MergeforwardList({
  content,
  onOpenNested,
  onClose,
}: {
  content: MergeforwardContent;
  onOpenNested: (c: MergeforwardContent) => void;
  onClose: () => void;
}) {
  const t = useT();
  const users = content.users ?? [];
  const msgs = content.msgs ?? [];

  if (msgs.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-text-tertiary">
        {t("mergeForward.noMessages")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {msgs.map((m, i) => {
        const showHead = i === 0 || msgs[i - 1].fromUID !== m.fromUID;
        return (
          <li key={m.messageID || `${m.fromUID}-${m.timestamp}-${i}`} className="flex gap-3">
            <div className="h-8 w-8 shrink-0">
              {showHead ? <InnerAvatar uid={m.fromUID} /> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {showHead ? (
                <header className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[14px] font-semibold text-[#1c1c23]">
                    {senderNameOf(m.fromUID, users)}
                    {isBotSender(m.fromUID) ? <AiBadge size="small" /> : null}
                  </span>
                  <span className="text-[14px] text-[rgba(28,28,35,0.4)]">
                    {formatInnerTime(m.timestamp, t)}
                  </span>
                </header>
              ) : null}
              <div className="text-[14px] leading-[1.5] break-words text-[rgba(28,28,35,0.8)]">
                <InnerContent msg={m} onOpenNested={onOpenNested} onClose={onClose} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InnerContent({
  msg,
  onOpenNested,
  onClose,
}: {
  msg: Message;
  onOpenNested: (c: MergeforwardContent) => void;
  onClose: () => void;
}) {
  const t = useT();
  if (msg.contentType === MessageContentType.text) {
    const text = (msg.content as MessageText).text ?? "";
    return <Markdown content={text} />;
  }
  if (msg.contentType === MessageContentType.image) {
    const img = msg.content as MessageImage;
    const ratio = Math.min(360 / (img.width || 200), 240 / (img.height || 200), 1);
    const w = Math.round((img.width || 200) * ratio);
    const h = Math.round((img.height || 200) * ratio);
    return img.url ? (
      <img
        src={img.url}
        alt=""
        width={w}
        height={h}
        className="rounded-md"
        style={{ maxWidth: 360, maxHeight: 240, objectFit: "contain" }}
      />
    ) : (
      <span>{t("message.digest.image")}</span>
    );
  }
  if (msg.contentType === MessageContentTypeConst.mergeForward) {
    const nested = msg.content as MergeforwardContent;
    return (
      <MergeforwardCard
        title={buildTitle(nested, t)}
        previewItems={buildPreview(nested)}
        onClick={() => onOpenNested(nested)}
      />
    );
  }
  if (msg.contentType === MessageContentTypeConst.richText) {
    // 合并转发详情内 RichText(对齐上游 fff36eb1):mergeforward modal 已在 z-index 顶,
    // 不嵌主 RichTextRenderer 的全屏 lightbox(double modal 体验差),只简单平铺 blocks
    const rtc = msg.content as {
      content?: Array<{ type?: string; text?: string; url?: string; name?: string }>;
    };
    const blocks = rtc.content || [];
    return (
      <div className="flex flex-col items-start gap-1.5">
        {blocks.map((blk, i) => {
          if (blk.type === "image" && blk.url) {
            try {
              const u = new URL(blk.url, window.location.href);
              if (u.protocol !== "http:" && u.protocol !== "https:") {
                return (
                  <span key={i} className="text-[12px] text-text-tertiary">
                    {t("message.digest.image")}
                  </span>
                );
              }
            } catch {
              return (
                <span key={i} className="text-[12px] text-text-tertiary">
                  {t("message.digest.image")}
                </span>
              );
            }
            return (
              <img
                key={i}
                src={blk.url}
                alt={blk.name || ""}
                className="block max-h-[200px] max-w-[320px] rounded-md object-contain"
              />
            );
          }
          if (blk.type === "file") {
            return (
              <span key={i} className="text-[13px] text-text-secondary">
                📎 {blk.name || t("message.digest.file")}
              </span>
            );
          }
          if (blk.text) {
            return (
              <span
                key={i}
                className="text-[14px] leading-[1.5] whitespace-pre-wrap text-text-primary"
              >
                {blk.text}
              </span>
            );
          }
          return null;
        })}
      </div>
    );
  }
  if (msg.contentType === MessageContentTypeConst.file) {
    return (
      <FileCard
        content={msg.content as { name?: string; ext?: string; size?: number; url?: string }}
        msg={msg}
        onClose={onClose}
      />
    );
  }
  return <span>{msg.content?.conversationDigest ?? t("mergeForward.messageFallback")}</span>;
}

function FileCard({
  content,
  msg,
  onClose,
}: {
  content: { name?: string; ext?: string; size?: number; url?: string };
  msg: Message;
  onClose: () => void;
}) {
  const name = content.name || tInst("mergeForward.unknownFile");
  const ext = (content.ext || "").toUpperCase();
  const size = content.size ?? 0;
  const url = content.url || "";
  const clickable = !!url;
  const iconBg = ((): string => {
    const e = ext.toLowerCase();
    if (e === "pdf") return "#EF4444";
    if (e === "doc" || e === "docx") return "#3B82F6";
    if (e === "xls" || e === "xlsx") return "#22C55E";
    if (e === "ppt" || e === "pptx") return "#F97316";
    if (e === "zip" || e === "rar" || e === "7z") return "#EAB308";
    return "#9CA3AF";
  })();
  const sizeText = ((): string => {
    if (size <= 0) return "0 B";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  })();
  const onClick = () => {
    if (!clickable) return;
    // 对齐上游 e41a1d7b (#125):合并转发文件卡片点击 → 预览而非下载。
    // 先关闭合并转发 modal(否则 modal mask 挡住预览面板),再打开 file-preview。
    onClose();
    chatSidePanelActions.openFilePreview({
      url,
      name,
      ext: getExtension(content.ext, content.name),
      size,
      messageId: msg.messageID,
      fromUID: msg.fromUID,
      conversationDigest: name,
      // 合并转发内层 message 无 channel/messageSeq 上下文,
      // sourceChannelId/sourceChannelType/messageSeq 不传(预览面板内"回复"按钮不显)
    });
  };
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`flex max-w-[300px] items-center gap-2.5 rounded-lg bg-[rgba(28,28,35,0.04)] px-3 py-2 transition-colors ${
        clickable ? "cursor-pointer hover:bg-[rgba(28,28,35,0.07)]" : "cursor-default"
      }`}
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white"
        style={{ backgroundColor: iconBg }}
      >
        {ext || "FILE"}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-[14px] font-medium text-text-primary" title={name}>
          {name}
        </div>
        <div className="text-[11px] text-text-tertiary">{sizeText}</div>
      </div>
    </div>
  );
}

function InnerAvatar({ uid }: { uid: string }) {
  return <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={32} />;
}
