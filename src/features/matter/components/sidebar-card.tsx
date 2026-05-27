import { Calendar } from "lucide-react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { MatterStatusBadge } from "@/features/matter/components/matter-status-badge";
import { UserName } from "@/features/matter/components/user-name";
import type { Matter } from "@/features/matter/types/matter.types";

interface SidebarCardProps {
  matter: Matter;
  selected: boolean;
  onClick: () => void;
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getFullYear() % 100}/${d.getMonth() + 1}/${d.getDate()}`;
}

const MAX_VISIBLE_ASSIGNEES = 3;

/**
 * Matter 列表卡(对应旧 dmworktodo SidebarCard 的 Tailwind 重写):
 *
 *   M-{seq_no}  [状态]                    [📅 DDL?]
 *   {title}
 *   [creator 头像] <UserName creator>  · {source_name?}
 *   [assignee 头像 ×N]
 *
 * 视觉:rounded-md 6px padding,hover bg-bg-hover,selected bg-brand-tint。
 * DDL 显式红字 — 提示截止日期临近;UserName 走 SDK channelInfo 异步补名。
 */
export function SidebarCard({ matter, selected, onClick }: SidebarCardProps) {
  const hasDeadline = !!matter.deadline;
  const assignees = matter.assignees ?? [];
  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_ASSIGNEES);
  const overflowCount = assignees.length - visibleAssignees.length;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-1.5 rounded-md px-3 py-2.5 text-left transition-colors duration-150 ease-(--ease-emphasized) ${
        selected ? "bg-brand-tint" : "hover:bg-bg-hover"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] text-text-tertiary">M-{matter.seq_no}</span>
          <MatterStatusBadge status={matter.status} />
        </div>
        {hasDeadline ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-error">
            <Calendar size={11} />
            {formatDeadline(matter.deadline!)}
          </span>
        ) : null}
      </div>

      <h3 className="line-clamp-2 truncate text-sm leading-snug font-semibold text-text-primary">
        {matter.title}
      </h3>

      <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <ChannelAvatar
          channel={new Channel(matter.creator_id, ChannelTypePerson)}
          size={16}
          title={matter.creator_id}
        />
        <UserName uid={matter.creator_id} className="truncate text-text-secondary" />
        {matter.source_name ? <span className="truncate">· {matter.source_name}</span> : null}
      </div>

      {assignees.length > 0 ? (
        <div className="flex items-center gap-1">
          <div className="flex -space-x-1">
            {visibleAssignees.map((a) => (
              <ChannelAvatar
                key={a.id}
                channel={new Channel(a.user_id, ChannelTypePerson)}
                size={18}
                title={a.user_id}
              />
            ))}
          </div>
          {overflowCount > 0 ? (
            <span className="text-[11px] text-text-tertiary">+{overflowCount}</span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
