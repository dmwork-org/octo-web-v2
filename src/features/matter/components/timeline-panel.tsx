import { useState } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Download } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import type { TimelineAttachment, TimelineEntry } from "@/features/matter/types/matter.types";
import { getFileIcon, formatFileSize } from "@/features/matter/utils/file-utils";

interface TimelinePanelProps {
  entries: TimelineEntry[];
  /** 是否允许显示 "↗ 原消息" 按钮（成员可见，非成员隐藏整条按钮） */
  canShowAnchor: boolean;
  /** 点击 "↗ 原消息" 时触发，传入 entry 和 event（定位弹框用） */
  onShowAnchor?: (entry: TimelineEntry, event: React.MouseEvent) => void;
  /** 下载附件回调 */
  onDownloadAttachment?: (attachment: TimelineAttachment, entry: TimelineEntry) => void;
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

function dayLabel(key: string): { label: string; raw: string } {
  const [y, m, d] = key.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(y, m - 1, d);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  const raw = `${m}/${d}`;
  if (diff === 0) return { label: "今天", raw };
  if (diff === 1) return { label: "昨天", raw };
  return { label: raw, raw };
}

/**
 * 群内事件时间线面板 — 按日期分组、带头像 + 用户名 + 内容 + 附件数 + 原消息按钮。
 * 对齐原版 wk-mp-tl 样式。
 */
export function TimelinePanel({
  entries,
  canShowAnchor,
  onShowAnchor,
  onDownloadAttachment,
}: TimelinePanelProps) {
  const [sortNewest, setSortNewest] = useState(true);

  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return sortNewest ? tb - ta : ta - tb;
  });
  const grouped = groupByDate(sorted);

  return (
    <div className="mt-0 flex flex-col gap-4 rounded-md border border-border-subtle bg-bg-surface p-6">
      {/* Header: 标题 + 排序切换 */}
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium leading-[20px] text-text-primary">群内进展</span>
        <button
          type="button"
          onClick={() => setSortNewest((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent text-[14px] leading-[20px] text-text-primary transition-colors hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M7.33333 10.667L4.66667 13.3337L2 10.667M4.66667 13.3337V2.66699"
              stroke="currentColor"
              strokeOpacity={sortNewest ? 1 : 0.4}
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M8.66602 5.33366L11.3327 2.66699L13.9993 5.33366M11.3327 2.66699V13.3337"
              stroke="currentColor"
              strokeOpacity={sortNewest ? 0.4 : 1}
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          时间排序
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-[14px] text-text-tertiary">暂无时间线记录</p>
      ) : (
        Array.from(grouped.entries()).map(([dateKey, items]) => {
          const dl = dayLabel(dateKey);
          return (
            <div key={dateKey} className="flex flex-col gap-2">
              {/* 日期分隔行 */}
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-[14px] font-medium leading-[20px] text-text-primary">
                  {dl.label}
                </span>
                {dl.label !== dl.raw && (
                  <span
                    className="shrink-0 text-[14px] font-medium leading-[20px]"
                    style={{ color: "rgba(28,28,35,0.4)" }}
                  >
                    {dl.raw}
                  </span>
                )}
                <span className="h-px flex-1" style={{ background: "rgba(28,28,35,0.15)" }} />
              </div>

              {/* 当日条目 */}
              <div className="flex flex-col gap-4">
                {items.map((entry) => {
                  const hasSourceMsgs =
                    Array.isArray(entry.source_msgs) && entry.source_msgs.length > 0;
                  return (
                    <div key={entry.id} className="flex items-start justify-between gap-2">
                      <div className="flex flex-1 items-start gap-2">
                        {/* 时间 */}
                        <span
                          className="shrink-0 text-[14px] leading-[20px]"
                          style={{ color: "rgba(28,28,35,0.4)" }}
                        >
                          {formatTime(entry.created_at)}
                        </span>
                        {/* 头像 + 用户名 */}
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <ChannelAvatar
                            channel={new Channel(entry.user_id, ChannelTypePerson)}
                            size={20}
                            title={entry.user_id}
                          />
                          <UserName
                            uid={entry.user_id}
                            className="text-[14px] font-normal leading-[20px] text-text-secondary"
                          />
                        </span>
                        {/* 冒号 + 内容 */}
                        <span className="shrink-0 text-[14px] leading-[20px] text-text-primary">
                          ：
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-[14px] leading-[20px] text-text-primary">
                            {entry.content || ""}
                          </span>
                          {/* 附件列表 */}
                          {entry.attachments && entry.attachments.length > 0 && (
                            <div
                              className="flex flex-wrap gap-1.5"
                              role="list"
                              aria-label="附件列表"
                            >
                              {entry.attachments.map((att) => {
                                const name = att.file_name || "未命名文件";
                                const sizeText =
                                  att.file_size != null ? formatFileSize(att.file_size) : null;
                                const iconUrl = getFileIcon(name, att.mime_type || "");
                                return (
                                  <div
                                    key={att.id}
                                    className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border-subtle bg-bg-surface px-2 py-1 transition-colors hover:border-border-default hover:bg-bg-item-hover"
                                    role="listitem"
                                    title={name}
                                  >
                                    <img
                                      src={iconUrl}
                                      alt=""
                                      width={20}
                                      height={20}
                                      className="shrink-0 object-contain"
                                      aria-hidden="true"
                                    />
                                    <span className="inline-flex min-w-0 max-w-[220px] items-baseline gap-1">
                                      <span className="truncate text-[12px] leading-[18px] text-text-primary">
                                        {name}
                                      </span>
                                      {sizeText && (
                                        <span className="shrink-0 text-[11px] text-text-tertiary">
                                          {sizeText}
                                        </span>
                                      )}
                                    </span>
                                    {onDownloadAttachment && (
                                      <span className="inline-flex shrink-0 items-center">
                                        <button
                                          type="button"
                                          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-xs border-0 bg-transparent text-icon-default transition-colors hover:bg-bg-item-hover hover:text-text-primary"
                                          title={`下载 ${name}`}
                                          aria-label={`下载 ${name}`}
                                          onClick={() => onDownloadAttachment(att, entry)}
                                        >
                                          <Download size={14} aria-hidden="true" />
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* ↗ 原消息 — isMember 时才渲染 */}
                      {canShowAnchor && (
                        <button
                          type="button"
                          disabled={!hasSourceMsgs}
                          title={hasSourceMsgs ? "查看原消息上下文" : "无原消息关联"}
                          onClick={
                            hasSourceMsgs && onShowAnchor
                              ? (ev) => onShowAnchor(entry, ev)
                              : undefined
                          }
                          className={`shrink-0 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent text-[14px] leading-[20px] text-text-primary transition-colors hover:text-text-primary ${
                            !hasSourceMsgs ? "cursor-not-allowed opacity-40" : ""
                          }`}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M14.333 1.66654L9.33318 1.66654L9.33318 2.99988L12.0564 2.99988L6.46884 8.58773L7.41167 9.53051L12.9996 3.9423L12.9995 6.66652L14.3328 6.66657L14.333 1.66654ZM7.33288 2.99984L2.99955 2.99984L2.99955 12.9998L12.9995 12.9998L12.9995 8.6665L14.3329 8.6665L14.3329 13.3332C14.3329 13.8855 13.8852 14.3332 13.3329 14.3332L2.66621 14.3332C2.11393 14.3332 1.66621 13.8855 1.66621 13.3332L1.66621 2.6665C1.66621 2.11422 2.11393 1.6665 2.66621 1.6665L7.33288 1.6665L7.33288 2.99984Z"
                              fill="currentColor"
                            />
                          </svg>
                          原消息
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
