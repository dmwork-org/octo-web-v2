import { type Message } from "wukongimjssdk";
import { ChevronRight } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";

interface MergeforwardRendererProps {
  message: Message;
}

/** 嵌套 message 的预览行(name: 内容)。content 可能是 SDK Message 也可能是 plain object。 */
interface InnerMsgLite {
  fromUID?: string;
  content?: { conversationDigest?: string; text?: string } | string;
}

function digestOfInner(m: InnerMsgLite, users: MergeforwardUser[]): string {
  const fromUID = m.fromUID ?? "";
  const sender = users.find((u) => u.uid === fromUID)?.name ?? fromUID;
  const c = m.content;
  let body = "";
  if (typeof c === "string") {
    body = c;
  } else if (c && typeof c === "object") {
    body = c.conversationDigest ?? c.text ?? "";
  }
  return sender ? `${sender}:${body}` : body;
}

/**
 * 合并转发卡片(对应旧 dmworkbase Messages/Mergeforward MergeforwardCell):
 *
 *   ┌─────────────────────────────┐
 *   │ 📋 聊天记录                ›│  ← 顶部:title + 右箭头
 *   │ ────────────────────────── │
 *   │ AoLi:今天开会的结论是…       │
 *   │ Thomas AI:需要先对齐一下…   │  ← 前 4 条预览
 *   │ AoLi:好的,明天上午十点      │
 *   │ ...                          │  ← 总数提示
 *   │ ────────────────────────── │
 *   │ 共 8 条消息                  │
 *   └─────────────────────────────┘
 *
 * 简化(P3+ 完善):
 * - 点击卡片 → 旧版打开全屏 dialog 看完整聊天记录;本期 toast 占位
 * - 嵌套 mergeForward(转发了一条转发) — 显示数字徽标 / 在 dialog 内继续展开
 */
export function MergeforwardRenderer({ message }: MergeforwardRendererProps) {
  const content = message.content as MergeforwardContent;
  const total = content.msgs?.length ?? 0;
  const preview = (content.msgs ?? []).slice(0, 4) as unknown as InnerMsgLite[];

  return (
    <button
      type="button"
      onClick={() => toast.info("展开聊天记录即将接入(P3+)")}
      className="flex w-72 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-surface text-left shadow-sm transition-colors hover:bg-bg-hover"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <span className="truncate text-[12px] font-semibold text-text-primary">
          {content.title || "聊天记录"}
        </span>
        <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
      </header>
      <ul className="flex flex-col gap-0.5 px-3 py-2 text-[11px] leading-snug text-text-secondary">
        {preview.length === 0 ? (
          <li className="text-text-tertiary">无内容</li>
        ) : (
          preview.map((m, i) => (
            <li key={i} className="truncate">
              {digestOfInner(m, content.users ?? [])}
            </li>
          ))
        )}
      </ul>
      {total > 0 ? (
        <footer className="border-t border-border-subtle px-3 py-1.5 text-[11px] text-text-tertiary">
          共 {total} 条消息
        </footer>
      ) : null}
    </button>
  );
}
