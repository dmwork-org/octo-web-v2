import { useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ArrowUpDown } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import type { TimelineEntry } from "@/features/matter/types/matter.types";

interface TimelinePanelProps {
  entries: TimelineEntry[];
  /** 是否允许显示 "↗ 原消息" 按钮（成员可见，非成员隐藏整条按钮） */
  canShowAnchor: boolean;
  /** 点击 "↗ 原消息" 时触发，传入 entry 和 event（定位弹框用） */
  onShowAnchor?: (entry: TimelineEntry, event: React.MouseEvent) => void;
}

/** 按日期分组 timeline entries */
function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  }
  return map;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function dayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(y, m - 1, d);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  return `${m}/${d}`;
}

/**
 * 群内事件时间线面板 — 按日期分组、带头像 + 用户名 + 内容 + 附件数 + 原消息按钮。
 */
export function TimelinePanel({ entries, canShowAnchor, onShowAnchor }: TimelinePanelProps) {
  const [sortNewest, setSortNewest] = useState(true);

  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return sortNewest ? tb - ta : ta - tb;
  });
  const grouped = groupByDate(sorted);

  return (
    <div>
      {/* Header: 标题 + 排序切换 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-text-secondary">群内事件时间线</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setSortNewest(true)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
              sortNewest
                ? "bg-bg-elevated text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <ArrowUpDown size={10} />
            最新在上
          </button>
          <button
            type="button"
            onClick={() => setSortNewest(false)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors ${
              !sortNewest
                ? "bg-bg-elevated text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <ArrowUpDown size={10} />
            最旧在上
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-tertiary">暂无时间线记录</p>
      ) : (
        Array.from(grouped.entries()).map(([dateKey, items]) => (
          <div key={dateKey}>
            {/* 日期分隔行 */}
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-medium text-text-secondary whitespace-nowrap">
                {dayLabel(dateKey)}
              </span>
              <span className="h-px flex-1 bg-border-subtle" />
            </div>

            {/* 当日条目 */}
            <div className="mb-3 flex flex-col gap-1">
              {items.map((entry) => {
                const hasSourceMsgs =
                  Array.isArray(entry.source_msgs) && entry.source_msgs.length > 0;
                return (
                  <div key={entry.id} className="flex items-start gap-2 py-1">
                    {/* 时间 */}
                    <span className="shrink-0 text-[11px] text-text-tertiary w-10 text-right tabular-nums">
                      {formatTime(entry.created_at)}
                    </span>
                    {/* 头像 */}
                    <ChannelAvatar
                      channel={new Channel(entry.user_id, ChannelTypePerson)}
                      size={16}
                    />
                    {/* 用户名 */}
                    <UserName
                      uid={entry.user_id}
                      className="text-[11px] font-medium text-text-secondary shrink-0"
                    />
                    {/* 内容 */}
                    <span className="flex-1 text-[13px] text-text-primary">
                      {entry.content || ""}
                    </span>
                    {/* 附件数 */}
                    {entry.attachments && entry.attachments.length > 0 && (
                      <span className="shrink-0 text-[11px] text-text-tertiary">
                        {entry.attachments.length} 附件
                      </span>
                    )}
                    {/* ↗ 原消息 — isMember 时才渲染 */}
                    {canShowAnchor ? (
                      <button
                        type="button"
                        disabled={!hasSourceMsgs}
                        title={hasSourceMsgs ? "查看原消息上下文" : "无原消息关联"}
                        onClick={
                          hasSourceMsgs && onShowAnchor
                            ? (ev) => onShowAnchor(entry, ev)
                            : undefined
                        }
                        className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors border ${
                          hasSourceMsgs
                            ? "text-text-tertiary border-transparent hover:text-text-primary hover:bg-bg-hover hover:border-border-default cursor-pointer"
                            : "text-text-tertiary/40 border-transparent cursor-not-allowed"
                        }`}
                      >
                        ↗ 原消息
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
