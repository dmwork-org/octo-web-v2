import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import WKSDK, {
  Channel,
  ChannelTypePerson,
  MessageContentType,
  type Message,
  type MessageImage,
  type MessageText,
} from "wukongimjssdk";
import { ArrowLeft, X } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";

interface MergeforwardRendererProps {
  message: Message;
}

/** ChannelType 2 = group;对齐 SDK ChannelTypeGroup。 */
const CHANNEL_TYPE_GROUP = 2;
/** 嵌套合并转发最大导航深度(对齐旧 MAX_NESTED_DEPTH=10)。 */
const MAX_NESTED_DEPTH = 10;

/**
 * Title 计算(对应旧 MergeforwardCell.getTitle):
 *   - group → "群的聊天记录"
 *   - person → "NAME1、NAME2 的聊天记录"
 *   - users 空 fallback → "聊天记录"
 */
function buildTitle(content: MergeforwardContent): string {
  if (content.channelType === CHANNEL_TYPE_GROUP) {
    return "群的聊天记录";
  }
  const names = (content.users ?? []).map((u) => u.name).filter(Boolean);
  if (names.length === 0) return "聊天记录";
  return `${names.join("、")}的聊天记录`;
}

/** 从 users map 拿 sender name,fallback channelInfo,再 fallback uid。 */
function senderNameOf(fromUID: string, users: MergeforwardUser[]): string {
  if (!fromUID) return "";
  const hit = users.find((u) => u.uid === fromUID)?.name;
  if (hit) return hit;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  return info?.title || fromUID;
}

/** sender 是否 bot(对齐旧 isBot helper:Person channelInfo.orgData.robot === 1)。 */
function isBotSender(fromUID: string): boolean {
  if (!fromUID) return false;
  const info = WKSDK.shared().channelManager.getChannelInfo(
    new Channel(fromUID, ChannelTypePerson),
  );
  return (info?.orgData as { robot?: number } | undefined)?.robot === 1;
}

/**
 * 详情弹窗内消息时间(对齐旧 getTimeStringAutoShort2 mustIncludeTime=true,简化版):
 *   今天 HH:mm / 昨天 HH:mm / MM-DD HH:mm / yyyy-MM-DD HH:mm
 */
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

/**
 * 主动 fetch 缺失的 sender Person channelInfo,首屏 title + bot 标记到位
 * (对齐旧 MergeforwardMessageList line 372-376 — content 切栈时按 fromUID 拉)。
 * 抽成命名 hook 满足 no-useeffect-in-component 规则。
 */
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

/** AI 徽标(对齐 message-row AiBadge,简化版)。 */
function AiBadge() {
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-[3px] bg-[#7f3bf5] px-1 text-[10px] leading-none font-semibold text-white">
      AI
    </span>
  );
}

/**
 * 合并转发卡片(对齐旧 ui/message/MergeforwardCard,1:1):
 *   bg rgba(28,28,35,0.03) / border 1px rgba(46,50,56,0.09) / r 8 / p 12
 *   min 200 max 400
 *   title 14/500/#1c1c23 mb 8
 *   items 12/rgba(28,28,35,0.6) gap 4 mb 10
 *   divider 1px rgba(46,50,56,0.09) mb 10
 *   footer 12/rgba(28,28,35,0.35) "聊天记录"
 */
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
      className="flex w-fit min-w-[200px] max-w-[400px] cursor-pointer flex-col rounded-lg border border-[rgba(46,50,56,0.09)] bg-[rgba(28,28,35,0.03)] p-3 text-left transition-colors hover:bg-[rgba(28,28,35,0.05)]"
    >
      <div className="mb-2 truncate text-[14px] font-medium text-[#1c1c23]">{title}</div>
      {previewItems.length > 0 ? (
        <ul className="mb-2.5 flex flex-col gap-1">
          {previewItems.map((text, i) => (
            <li key={i} className="truncate text-[12px] text-[rgba(28,28,35,0.6)]">
              {text}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mb-2.5 h-px bg-[rgba(46,50,56,0.09)]" />
      <div className="text-[12px] text-[rgba(28,28,35,0.35)]">聊天记录</div>
    </button>
  );
}

/**
 * 把 MergeforwardContent 转成卡片预览数组(最多 4 条,name: digest 拼接)。
 * 嵌套合并转发的 digest 走 MergeforwardContent.conversationDigest = "[合并转发]"。
 */
function buildPreview(content: MergeforwardContent): string[] {
  const users = content.users ?? [];
  return (content.msgs ?? []).slice(0, 4).map((m) => {
    const name = senderNameOf(m.fromUID, users);
    const digest = m.content?.conversationDigest ?? "";
    return name ? `${name}：${digest}` : digest;
  });
}

/**
 * 合并转发消息渲染(对齐旧 Messages/Mergeforward + ui/message/MergeforwardCard):
 * 点击卡片 → 弹 Modal 列嵌套消息,支持嵌套合并转发递归(stack 导航)。
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
      {open ? <MergeforwardModal root={root} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * 聊天记录详情弹窗(对齐旧 .wk-mergeforward-modal + MergeforwardMessageList):
 * - 480 宽 / max-h calc(100vh - 160px)
 *   **注意**:Tailwind arbitrary value 内 `calc()` 减号两侧必须有空格 →
 *   `[calc(100vh_-_160px)]`(下划线 = 空格)。直接写 `[calc(100vh-160px)]`
 *   会生成非法 CSS 被浏览器丢弃,max-h 失效导致 Modal 撑超视口。
 * - Header 56px:[ArrowLeft 可返回时] + title + X
 * - Body:gap 16 / pad 10/16,每条消息 = [avatar 32 + info(name+time / content)]
 * - 嵌套合并转发(type=11)点击 → push contentStack,header navTitle 跟随
 *
 * **createPortal 到 document.body**:Modal 触发链是 message-row → message-list
 * (overflow-y-auto 滚动容器),fixed 会被滚动容器的 stacking context trap,
 * 导致 chat text 跨 z-index 透到 Modal box 上(用户截图 16 现象)。
 * Portal 到 body 让 Modal 脱离父子 stacking,z-[100] 真正生效。
 *
 * z-[100]:压在 Toast 之下,但在普通 modal(z-50/60)和业务浮层之上。
 */
function MergeforwardModal({ root, onClose }: { root: MergeforwardContent; onClose: () => void }) {
  const [stack, setStack] = useState<MergeforwardContent[]>([]);
  const current = stack.length > 0 ? stack[stack.length - 1] : root;
  const canGoBack = stack.length > 0;

  usePrefetchSenderInfos(current);

  const pushNested = (c: MergeforwardContent) => {
    if (stack.length >= MAX_NESTED_DEPTH) return;
    setStack((prev) => [...prev, c]);
  };
  const goBack = () => setStack((prev) => prev.slice(0, -1));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[calc(100vh_-_160px)] w-[480px] flex-col overflow-hidden rounded-lg bg-bg-surface shadow-xl">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-default px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
            <h2 className="truncate text-base font-medium text-text-primary">
              {buildTitle(current)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <div key={`stack-${stack.length}`} className="flex-1 overflow-y-auto px-4 py-2.5">
          <MergeforwardList content={current} onOpenNested={pushNested} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Modal 内消息列表(对齐旧 MergeforwardMessageList):
 * gap 16,单条 = [avatar 32 + info(name+time / content)]
 * 连续同 sender 头像位置占位(对齐旧 showAvatar 计算)。
 */
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
                    {isBotSender(m.fromUID) ? <AiBadge /> : null}
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

/**
 * 嵌套消息内容渲染(对齐旧 MergeforwardMessageList.getMsgContent):
 * - text → Markdown(自动 linkify URL,gfm autolinks)
 * - image → 缩略 img(无 Lightbox,P5+ 接)
 * - mergeForward → 嵌套 MergeforwardCard,点击 push stack
 * - 其他 → content.conversationDigest fallback("[文件]"/"[图片]"...)
 */
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
    return <FileCard content={msg.content as { name?: string; ext?: string; size?: number }} />;
  }
  return <span>{msg.content?.conversationDigest ?? "[消息]"}</span>;
}

/**
 * 文件卡片(对齐旧 MergeforwardMessageList .wk-mergeforward-file CSS):
 *   - 容器:flex / pad 8 12 / bg rgba(28,28,35,0.04) / r 8 / gap 10 / max-w 300
 *   - icon 56x56 / r 8 / iconBg 按 ext 配色 / 文字白色 ext 全大写居中
 *   - name 14/500/text-primary truncate
 *   - size 11/text-tertiary
 *
 * 按扩展名配色(对齐旧 getFileExtColor):
 *   pdf → 红 / doc(x) → 蓝 / xls(x) → 绿 / ppt(x) → 橙 / zip|rar|7z → 黄 / 其他 → 灰
 *
 * 简化(对齐但未做):URL 点击下载 — 后续 P5+ 接 file-renderer 同款下载逻辑。
 */
function FileCard({ content }: { content: { name?: string; ext?: string; size?: number } }) {
  const name = content.name || "unknown file";
  const ext = (content.ext || "").toUpperCase();
  const size = content.size ?? 0;
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
  return (
    <div className="flex max-w-[300px] items-center gap-2.5 rounded-lg bg-[rgba(28,28,35,0.04)] px-3 py-2">
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

/**
 * Modal 内 32×32 头像 — 复用 `<ChannelAvatar>`(它处理 baseURL 拼接 + 加载失败
 * fallback 首字母,避免裸 `<img>` 用 channelInfo.logo 相对路径(`users/xxx/avatar`)
 * broken image 的问题)。
 */
function InnerAvatar({ uid }: { uid: string }) {
  return <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={32} />;
}
