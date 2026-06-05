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
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { api } from "@/features/base/api/client";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface MergeforwardRendererProps {
  message: Message;
}

const CHANNEL_TYPE_GROUP = 2;
const MAX_NESTED_DEPTH = 10;

function buildTitle(content: MergeforwardContent): string {
  if (content.channelType === CHANNEL_TYPE_GROUP) {
    return "群的聊天记录";
  }
  const names = (content.users ?? []).map((u) => u.name).filter(Boolean);
  if (names.length === 0) return "聊天记录";
  return `${names.join("、")}的聊天记录`;
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

function formatInnerTime(ts: number): string {
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
  if (sameDay(d, y)) return `昨天 ${hhmm}`;
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
      if (!mgr.getChannelInfo(ch)) void mgr.fetchChannelInfo(ch);
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
      <div className="text-[12px] text-[rgba(28,28,35,0.35)]">聊天记录</div>
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
  const root = message.content as MergeforwardContent;
  const [open, setOpen] = useState(false);
  return (
    <>
      <MergeforwardCard
        title={buildTitle(root)}
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
              aria-label="返回"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
            >
              <ArrowLeft size={16} />
            </button>
          ) : null}
          <span className="truncate text-base font-medium text-text-primary">
            {buildTitle(current)}
          </span>
        </div>
      }
      className="w-[480px] max-h-[calc(100vh_-_160px)]"
      contentClassName="px-4 py-2.5"
    >
      <div key={`stack-${stack.length}`}>
        <MergeforwardList content={current} onOpenNested={pushNested} />
      </div>
    </BaseDialog>
  );
}

function MergeforwardList({
  content,
  onOpenNested,
}: {
  content: MergeforwardContent;
  onOpenNested: (c: MergeforwardContent) => void;
}) {
  const users = content.users ?? [];
  const msgs = content.msgs ?? [];

  if (msgs.length === 0) {
    return <div className="py-8 text-center text-sm text-text-tertiary">无消息</div>;
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
                    {formatInnerTime(m.timestamp)}
                  </span>
                </header>
              ) : null}
              <div className="text-[14px] leading-[1.5] break-words text-[rgba(28,28,35,0.8)]">
                <InnerContent msg={m} onOpenNested={onOpenNested} />
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
}: {
  msg: Message;
  onOpenNested: (c: MergeforwardContent) => void;
}) {
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
      <span>[图片]</span>
    );
  }
  if (msg.contentType === MessageContentTypeConst.mergeForward) {
    const nested = msg.content as MergeforwardContent;
    return (
      <MergeforwardCard
        title={buildTitle(nested)}
        previewItems={buildPreview(nested)}
        onClick={() => onOpenNested(nested)}
      />
    );
  }
  if (msg.contentType === MessageContentTypeConst.file) {
    return (
      <FileCard
        content={msg.content as { name?: string; ext?: string; size?: number; url?: string }}
      />
    );
  }
  return <span>{msg.content?.conversationDigest ?? "[消息]"}</span>;
}

async function triggerDownload(url: string, filename: string): Promise<void> {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return;
  }
  let downloadUrl = parsed.href;
  const isCrossOrigin = parsed.origin !== window.location.origin;
  if (isCrossOrigin && filename) {
    try {
      const resp = await api<{ url?: string }>(
        `file/download/url?path=${encodeURIComponent(parsed.href)}&filename=${encodeURIComponent(filename)}`,
      );
      if (resp?.url) downloadUrl = resp.url;
    } catch {
      // 拿预签名失败,fallback 用 raw url
    }
  }
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  if (isCrossOrigin) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function FileCard({
  content,
}: {
  content: { name?: string; ext?: string; size?: number; url?: string };
}) {
  const name = content.name || "unknown file";
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
    void triggerDownload(url, name);
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
