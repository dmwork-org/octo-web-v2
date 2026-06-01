import { useState } from "react";
import { type Message } from "wukongimjssdk";
import { X } from "lucide-react";
import {
  MergeforwardContent,
  type MergeforwardInnerMsg,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";

interface MergeforwardRendererProps {
  message: Message;
}

/** ChannelType 2 = group;对齐 SDK ChannelTypeGroup。 */
const CHANNEL_TYPE_GROUP = 2;

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

/**
 * 嵌套消息 digest(对齐旧各 MessageContent.conversationDigest):
 *   - text/payload.type=1 取 content/text
 *   - 合并转发(type=11)→ "[合并转发]"(不是 "[聊天记录]" — 这是 conversationDigest 不是 type label)
 *   - 其他类型按统一 fallback "[<类型>]"
 *
 * 这里不实例化 SDK Message,直接查表 — 嵌套合并转发的真实 digest 也对齐
 * MergeforwardContent.conversationDigest = "[合并转发]"。
 */
function digestOfInnerPayload(m: MergeforwardInnerMsg): string {
  const t = m.payload?.type;
  if (t === 1) return (m.payload?.content as string) || (m.payload?.text as string) || "";
  if (t === 2) return "[图片]";
  if (t === 3) return "[动图]";
  if (t === 4) return "[语音]";
  if (t === 5) return "[小视频]";
  if (t === 6) return "[位置]";
  if (t === 7) return "[名片]";
  if (t === 8) return "[文件]";
  if (t === 11) return "[合并转发]";
  if (t === 12 || t === 13) return "[贴纸]";
  return "[消息]";
}

function senderNameOf(fromUID: string | undefined, users: MergeforwardUser[]): string {
  if (!fromUID) return "";
  return users.find((u) => u.uid === fromUID)?.name ?? fromUID;
}

function formatTimestamp(ts: number | undefined): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

/**
 * 合并转发卡片(对齐旧 dmworkbase ui/message/MergeforwardCard + index.css):
 *
 *   ┌──────────────────────────────────┐
 *   │ 群的聊天记录                       │  ← 14/500/#1c1c23
 *   │                                    │
 *   │ 向晨瑜：[合并转发]                  │  ← 前 4 条预览 12/rgba(28,28,35,0.6)
 *   │ 邹嘉翘：[合并转发]                  │
 *   │ 游艳馨：一键领养龙虾...              │
 *   │ ───────────────────────────────  │  ← 1px rgba(46,50,56,0.09)
 *   │ 聊天记录                           │  ← 12/rgba(28,28,35,0.35)
 *   └──────────────────────────────────┘
 *
 * 卡片样式:bg rgba(28,28,35,0.03) / border 1px rgba(46,50,56,0.09) / r 8 / p 12 / max 400
 *
 * **点击** → 弹 Modal 列出全部嵌套消息(简版:name + time + digest,不递归实例化
 * 嵌套合并转发 — 后续 M5+ 接 SDK Message decode 再做真实渲染)。
 */
export function MergeforwardRenderer({ message }: MergeforwardRendererProps) {
  const content = message.content as MergeforwardContent;
  const title = buildTitle(content);
  const users = content.users ?? [];
  const msgs = content.msgs ?? [];
  const preview = msgs.slice(0, 4);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit min-w-[200px] max-w-[400px] cursor-pointer flex-col rounded-lg border border-[rgba(46,50,56,0.09)] bg-[rgba(28,28,35,0.03)] p-3 text-left transition-colors hover:bg-[rgba(28,28,35,0.05)]"
      >
        <div className="mb-2 truncate text-[14px] font-medium text-[#1c1c23]">{title}</div>
        {preview.length > 0 ? (
          <ul className="mb-2.5 flex flex-col gap-1">
            {preview.map((m, i) => (
              <li
                key={(m.message_id as string | undefined) ?? i}
                className="truncate text-[12px] text-[rgba(28,28,35,0.6)]"
              >
                {senderNameOf(m.from_uid, users)}：{digestOfInnerPayload(m)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mb-2.5 h-px bg-[rgba(46,50,56,0.09)]" />
        <div className="text-[12px] text-[rgba(28,28,35,0.35)]">聊天记录</div>
      </button>

      {open ? (
        <MergeforwardModal title={title} msgs={msgs} users={users} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * 聊天记录详情弹窗 — 简版(对齐旧 .wk-mergeforward-modal 480 宽 + header 56 + body 滚动):
 * 列每条嵌套消息(sender + time + digest),不实例化 SDK Message 做真实渲染。
 * 后续(M5+) 可接 MergeforwardMessageList 真递归渲染嵌套合并转发/图片/文件等。
 */
function MergeforwardModal({
  title,
  msgs,
  users,
  onClose,
}: {
  title: string;
  msgs: MergeforwardInnerMsg[];
  users: MergeforwardUser[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[calc(100vh-160px)] w-[480px] flex-col overflow-hidden rounded-lg bg-bg-surface shadow-xl">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-default px-4">
          <h2 className="truncate text-base font-medium text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {msgs.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-tertiary">无消息</div>
          ) : (
            <ul className="flex flex-col gap-3">
              {msgs.map((m, i) => (
                <li key={(m.message_id as string | undefined) ?? i} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-text-primary">
                      {senderNameOf(m.from_uid, users)}
                    </span>
                    <span className="text-[11px] text-text-tertiary">
                      {formatTimestamp(m.timestamp)}
                    </span>
                  </div>
                  <div className="text-sm leading-[1.5] break-words whitespace-pre-wrap text-[rgba(28,28,35,0.8)]">
                    {digestOfInnerPayload(m)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
