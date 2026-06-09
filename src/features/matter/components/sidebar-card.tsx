import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import type { Matter, MatterStatus } from "@/features/matter/types/matter.types";

interface SidebarCardProps {
  matter: Matter;
  selected: boolean;
  onClick: () => void;
}

const STATUS_KEY: Record<MatterStatus, string> = {
  open: "matter.status.open",
  done: "matter.status.done",
  archived: "matter.status.archived",
};

/**
 * 状态 pill 颜色,对齐原 dmworktodo:
 * - open:brand 浅蓝
 * - done:online 浅绿
 * - archived:灰
 */
const STATUS_CLASS: Record<MatterStatus, string> = {
  open: "bg-brand-tint text-brand",
  done: "bg-online/10 text-online",
  archived: "bg-bg-elevated text-text-tertiary",
};

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 简笔封套日历 SVG(对齐原 SidebarCard/index.tsx:55-64)。lucide Calendar 视觉
 * 过重,用原项目同款细线轮廓。
 */
function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <path
        d="M4 1v1.5M8 1v1.5M1.5 4.5h9M2.5 2.5h7a1 1 0 011 1v6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-6a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface MetaRowProps {
  label: string;
  children: React.ReactNode;
}

function MetaRow({ label, children }: MetaRowProps) {
  return (
    <div className="flex items-center gap-1 text-xs leading-4 text-icon-default">
      <span className="shrink-0">{label}</span>
      <span className="inline-flex items-center gap-1">{children}</span>
    </div>
  );
}

/**
 * Matter 列表卡(1:1 复刻 dmworktodo SidebarCard/index.tsx):
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [进行中｜M-142]                          📅 5/29   │
 *   │ {title 两行 line-clamp}                              │
 *   │ 创建人:[头像] {name}                                 │
 *   │ 负责人:[头像组叠加] {name}等N人(N>1时)              │
 *   └─────────────────────────────────────────────────────┘
 *
 * 视觉关键点(对齐原项目):
 * - 状态 pill rounded-full,内含「label｜M-seq_no」全角竖线分隔
 * - DDL 灰色(text-tertiary)+ 细线封套日历 SVG(非红色,非 lucide Calendar)
 * - 多 assignee:前 3 头像叠加(-4px margin)+ 第一人名字+"等N人"
 * - 单 assignee:头像 + 名字(无"等")
 * - selected:bg-bg-surface + brand 描边 + shadow 轻微浮起
 */
export function SidebarCard({ matter, selected, onClick }: SidebarCardProps) {
  const t = useT();
  const statusLabel = t(STATUS_KEY[matter.status]);
  const statusClass = STATUS_CLASS[matter.status];
  const assignees = matter.assignees ?? [];
  const visibleAssignees = assignees.slice(0, 3);
  const firstAssigneeUid = assignees[0]?.user_id;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`animate-[cardFadeIn_0.2s_ease-out_both] flex w-full cursor-pointer flex-col gap-2 rounded-md border border-transparent p-3 text-left transition-[background,border-color,box-shadow] duration-150 ease-(--ease-emphasized) ${
        selected
          ? "border-accent bg-bg-surface shadow-[0_4px_12px_rgba(28,28,35,0.04),0_0_10px_1px_rgba(28,28,35,0.04)]"
          : "bg-white/80 hover:bg-bg-surface hover:shadow-[0_2px_8px_rgba(28,28,35,0.04)]"
      }`}
    >
      {/* 第一行:状态 pill + DDL */}
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-5 items-center rounded-full px-2 text-xs leading-5 ${statusClass}`}
        >
          <span className="font-semibold">{statusLabel}</span>
          {matter.seq_no ? <span className="font-normal">｜M-{matter.seq_no}</span> : null}
        </span>
        {matter.deadline ? (
          <span className="flex items-center gap-0.5 text-xs leading-[18px] text-icon-default">
            <CalendarIcon />
            {formatDeadline(matter.deadline)}
          </span>
        ) : null}
      </div>

      {/* 第二行:标题 */}
      <h3 className="line-clamp-2 text-[14px] leading-5 font-medium text-text-primary">
        {matter.title}
      </h3>

      {/* 第三行:创建人 + 负责人 */}
      <div className="flex flex-col gap-1">
        <MetaRow label={t("matter.sidebar.createdByLabel")}>
          <ChannelAvatar
            channel={new Channel(matter.creator_id, ChannelTypePerson)}
            size={16}
            title={matter.creator_id}
          />
          <UserName uid={matter.creator_id} className="text-text-primary" />
        </MetaRow>

        {assignees.length > 0 && firstAssigneeUid ? (
          <MetaRow label={t("matter.sidebar.assigneeLabel")}>
            <span className="inline-flex items-center">
              {visibleAssignees.map((a, i) => (
                <span
                  key={a.id}
                  className="relative inline-flex"
                  style={{ marginLeft: i > 0 ? -4 : 0, zIndex: 3 - i }}
                >
                  <ChannelAvatar
                    channel={new Channel(a.user_id, ChannelTypePerson)}
                    size={16}
                    title={a.user_id}
                  />
                </span>
              ))}
            </span>
            <span className="text-text-primary">
              <UserName uid={firstAssigneeUid} />
              {assignees.length > 1
                ? t("matter.sidebar.assigneeCountSuffix", { values: { count: assignees.length } })
                : ""}
            </span>
          </MetaRow>
        ) : null}
      </div>
    </button>
  );
}
