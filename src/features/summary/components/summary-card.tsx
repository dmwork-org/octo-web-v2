import { useState } from "react";
import { CalendarDays, Trash2, UserRound } from "lucide-react";
import { useStore } from "@tanstack/react-store";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { authStore } from "@/features/base/stores/auth";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import {
  ParticipantStatus,
  TriggerType,
  type SummaryListItem,
} from "@/features/summary/types/summary.types";
import { SummaryStatusBadge } from "@/features/summary/components/summary-status-badge";

interface SummaryCardProps {
  item: SummaryListItem;
  selected: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onRespond?: (action: "accept" | "reject") => void;
}

/**
 * 总结列表卡。业务信息对齐上游:列表只展示创建日期,不展示总结覆盖时间范围。
 */
export function SummaryCard({ item, selected, onClick, onDelete, onRespond }: SummaryCardProps) {
  const t = useT();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const currentUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const myParticipant = item.participants?.find((p) => p.user_id === currentUid);
  const isMultiParticipant = (item.participants?.length ?? 0) > 1;
  const isPendingInvite =
    isMultiParticipant &&
    myParticipant != null &&
    myParticipant.status === ParticipantStatus.PENDING;
  const isScheduledTask =
    (item.schedule_id != null && item.schedule_id > 0) ||
    item.trigger_type === TriggerType.SCHEDULED;
  const confirmDelete = () => {
    if (!onDelete) return;
    setDeleteConfirmOpen(true);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onClick();
        }}
        className={`group relative flex w-full shrink-0 cursor-pointer flex-col gap-2 overflow-hidden rounded-md border p-3 text-left transition-all duration-150 ease-(--ease-emphasized) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/10 ${
          selected
            ? "border-border-default bg-brand-tint/50 shadow-[0_2px_8px_rgba(28,28,35,0.05)]"
            : "border-transparent bg-bg-surface/80 hover:bg-bg-surface hover:shadow-[0_2px_8px_rgba(28,28,35,0.04)]"
        }`}
      >
        {selected ? (
          <span className="absolute top-3 bottom-3 left-0 w-0.75 rounded-r-full bg-brand/70" />
        ) : null}
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-5 font-medium text-text-primary">
            {item.title || item.task_no}
          </h3>
          <SummaryStatusBadge status={item.status} />
        </div>
        {isPendingInvite && onRespond ? (
          <div className="flex gap-2 pt-1" onClick={(event) => event.stopPropagation()}>
            <Button type="primary" theme="solid" size="small" onClick={() => onRespond("accept")}>
              {t("summary.action.accept")}
            </Button>
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              onClick={() => onRespond("reject")}
            >
              {t("summary.action.reject")}
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[12px] leading-4 text-text-tertiary">
          <span className="flex min-w-0 items-center gap-1.5">
            <UserRound size={13} className="shrink-0 text-text-tertiary" />
            <span className="min-w-0 truncate">
              {t("summary.summaryCard.createdBy", {
                values: { name: item.creator_name || t("summary.common.unknown") },
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <CalendarDays size={13} className="text-text-tertiary" />
            {item.created_at?.substring(0, 10) || ""}
          </span>
          {onDelete ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("summary.common.delete")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary opacity-0 transition-colors group-hover:opacity-100 hover:bg-error/10 hover:text-error focus:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                confirmDelete();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                confirmDelete();
              }}
            >
              <Trash2 size={13} />
            </span>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("summary.summaryCard.deleteTitle")}
        content={t(
          isScheduledTask
            ? "summary.summaryCard.deleteScheduledContent"
            : "summary.summaryCard.deleteContent",
          {
            values: { title: item.title || item.task_no },
          },
        )}
        okText={t("summary.common.delete")}
        cancelText={t("summary.common.cancel")}
        okDanger
        onOk={() => {
          setDeleteConfirmOpen(false);
          onDelete?.();
        }}
      />
    </>
  );
}
