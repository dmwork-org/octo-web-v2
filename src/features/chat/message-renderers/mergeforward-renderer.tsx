import { type Message } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
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
 * 嵌套消息 digest(根据 payload.type 推:1=text 取 content/text,其他类型回 [类型])。
 * 对齐旧 conversationDigest 各 MessageContent 的实现 — 这里集中查表避免依赖 SDK
 * Message 实例化。
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
  if (t === 11) return "[聊天记录]";
  if (t === 12 || t === 13) return "[贴纸]";
  return "[消息]";
}

function senderNameOf(fromUID: string | undefined, users: MergeforwardUser[]): string {
  if (!fromUID) return "";
  return users.find((u) => u.uid === fromUID)?.name ?? fromUID;
}

/**
 * 合并转发卡片(对应旧 dmworkbase Messages/Mergeforward MergeforwardCell):
 *
 *   ┌──────────────────────────────────┐
 *   │ 群的聊天记录                       │  ← 加粗标题(无右箭头,无顶部分隔线)
 *   │                                    │
 *   │ 王宜林:@Octo 产品管家               │
 *   │ 王宜林:「最近」升级后,时间排序…       │  ← 前 4 条预览(name:digest)
 *   │ 王宜林:[图片]                       │
 *   │ 王宜林:第二个 bug:                  │
 *   │ ─────────────────────────────── │
 *   │ 聊天记录                           │  ← footer 灰字"聊天记录"(不显示数量)
 *   └──────────────────────────────────┘
 *
 * 简化(P3+ 完善):
 * - 点击卡片 → 旧版打开 WKModal 看完整聊天记录;本期 toast 占位
 */
export function MergeforwardRenderer({ message }: MergeforwardRendererProps) {
  const content = message.content as MergeforwardContent;
  const title = buildTitle(content);
  const users = content.users ?? [];
  const preview = (content.msgs ?? []).slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => toast.info("展开聊天记录即将接入(P3+)")}
      className="flex w-80 flex-col overflow-hidden rounded-md bg-bg-elevated text-left transition-colors hover:bg-bg-hover"
    >
      <div className="flex flex-col gap-1.5 px-4 pt-3 pb-3">
        <div className="text-[14px] font-semibold text-text-primary">{title}</div>
        {preview.length === 0 ? (
          <div className="text-[12px] text-text-tertiary">无内容</div>
        ) : (
          <ul className="flex flex-col gap-1 text-[12px] leading-snug text-text-secondary">
            {preview.map((m, i) => (
              <li key={(m.message_id as string | undefined) ?? i} className="truncate">
                <span className="text-text-secondary">{senderNameOf(m.from_uid, users)}</span>
                <span className="text-text-tertiary">:</span>
                <span className="ml-1 text-text-secondary">{digestOfInnerPayload(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="border-t border-border-subtle/70 px-4 py-2 text-[12px] text-text-tertiary">
        聊天记录
      </footer>
    </button>
  );
}
