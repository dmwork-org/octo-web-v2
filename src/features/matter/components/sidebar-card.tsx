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

/**
 * Matter 列表卡(对齐 P3-matter 设计稿,白底 + 阴影 + 大圆角 + selected 紫边):
 *
 *   [状态徽章] | M-96
 *   {title 大字粗体}
 *   创建人: [头像] {creator}
 *   负责人: [头像] {assignee 0}
 *
 * 设计稿信息密度:status / M-序号 / title / 创建人 / 负责人 各占独立段。本期
 * 仅渲染第一个 assignee(单负责人主路径);多 assignee 由详情面板展开。
 *
 * DDL / source_name 在卡片上不显示(详情面板里展示),与设计稿一致。
 */
export function SidebarCard({ matter, selected, onClick }: SidebarCardProps) {
  const firstAssignee = matter.assignees?.[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full flex-col gap-2 rounded-xl border bg-bg-surface p-4 text-left shadow-sm transition-all duration-150 ease-(--ease-emphasized) ${
        selected
          ? "border-brand ring-1 ring-brand/30"
          : "border-border-subtle hover:border-border-default"
      }`}
    >
      <div className="flex items-center gap-2 text-[12px]">
        <MatterStatusBadge status={matter.status} />
        <span className="text-text-tertiary">|</span>
        <span className="font-mono text-text-tertiary">M-{matter.seq_no}</span>
      </div>

      <h3 className="line-clamp-2 text-base leading-snug font-semibold text-text-primary">
        {matter.title}
      </h3>

      <div className="flex flex-col gap-1.5 text-[12px] text-text-tertiary">
        <div className="flex items-center gap-2">
          <span className="shrink-0">创建人:</span>
          <ChannelAvatar
            channel={new Channel(matter.creator_id, ChannelTypePerson)}
            size={20}
            title={matter.creator_id}
          />
          <UserName uid={matter.creator_id} className="truncate text-text-primary" />
        </div>
        {firstAssignee ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0">负责人:</span>
            <ChannelAvatar
              channel={new Channel(firstAssignee.user_id, ChannelTypePerson)}
              size={20}
              title={firstAssignee.user_id}
            />
            <UserName uid={firstAssignee.user_id} className="truncate text-text-primary" />
            {(matter.assignees?.length ?? 0) > 1 ? (
              <span className="text-text-tertiary">+{(matter.assignees?.length ?? 0) - 1}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </button>
  );
}
