import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronDown, Edit3 } from "lucide-react";
import { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import {
  confirmParticipation,
  declineParticipation,
  submitPersonalResult,
} from "@/features/summary/api/summary.api";
import { CitationText } from "@/features/summary/components/citation-text";
import { SummarySourcePicker } from "@/features/summary/components/summary-source-picker";
import { SummaryContent } from "@/features/summary/components/summary-content";
import { SummaryEditor } from "@/features/summary/components/summary-editor";
import {
  personalResultQueryKey,
  personalResultQueryOptions,
  summaryDetailQueryKey,
} from "@/features/summary/queries/summaries.query";
import { summaryBadgeQueryKey } from "@/features/summary/queries/summary-badge.query";
import {
  ParticipantStatus,
  SourceType,
  TaskStatus,
  type Participant,
  type SourceItem,
  type SummaryDetail,
} from "@/features/summary/types/summary.types";

interface PersonalSectionProps {
  detail: SummaryDetail;
}

function findMyParticipant(detail: SummaryDetail, uid: string): Participant | undefined {
  return detail.participants.find((p) => p.user_id === uid);
}

function convToSource(c: Conversation): SourceItem {
  const type =
    c.channel.channelType === ChannelTypeGroup
      ? SourceType.GROUP_CHAT
      : c.channel.channelType === ChannelTypePerson
        ? SourceType.DIRECT_MESSAGE
        : SourceType.THREAD;
  return {
    source_type: type,
    source_id: c.channel.channelID,
    source_name: c.channelInfo?.title ?? c.channel.channelID,
  };
}

/** ConfirmStep 让被邀者多选来源然后 POST /confirm */
function ConfirmStep({ taskId, onConfirmed }: { taskId: number; onConfirmed: () => void }) {
  const tr = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: conversations } = useQuery(conversationsQueryOptions(spaceId));
  const candidates = useMemo(() => {
    return (conversations ?? []).filter(
      (c) =>
        c.channel.channelType === ChannelTypeGroup || c.channel.channelType === ChannelTypePerson,
    );
  }, [conversations]);

  const confirmMu = useMutation({
    mutationFn: () => {
      const sources = candidates
        .filter((c) => selectedIds.has(c.channel.channelID))
        .map(convToSource);
      return confirmParticipation(taskId, sources);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
      void qc.invalidateQueries({ queryKey: personalResultQueryKey(taskId) });
      // confirm/decline 让本任务从 WAITING_CONFIRM 退出,NavRail badge 立刻减(无需等 60s)
      void qc.invalidateQueries({ queryKey: summaryBadgeQueryKey });
      message.success(t("summary.personal.confirmedToast"));
      onConfirmed();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.personal.confirmFailed")),
  });

  const declineMu = useMutation({
    mutationFn: () => declineParticipation(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
      void qc.invalidateQueries({ queryKey: summaryBadgeQueryKey });
      message.success(t("summary.personal.declinedToast"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.personal.declineFailed")),
  });

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-3">
      <p className="text-sm text-text-primary">{tr("summary.personal.confirmPrompt")}</p>
      <SummarySourcePicker
        candidates={candidates}
        selectedIds={selectedIds}
        onToggle={toggle}
        emptyLabel={tr("summary.personal.noContributable")}
        tagGroupLabel={tr("summary.personal.tagGroup")}
        tagDirectLabel={tr("summary.personal.tagDirect")}
        className="max-h-56"
      />
      <div className="flex justify-end gap-2">
        <Button
          type="tertiary"
          theme="borderless"
          size="small"
          loading={declineMu.isPending}
          onClick={() => declineMu.mutate()}
        >
          {tr("summary.personal.decline")}
        </Button>
        <Button
          type="primary"
          theme="solid"
          size="small"
          loading={confirmMu.isPending}
          disabled={selectedIds.size === 0}
          onClick={() => confirmMu.mutate()}
        >
          {tr("summary.personal.confirmCount", { values: { count: selectedIds.size } })}
        </Button>
      </div>
    </div>
  );
}

/** MyResult 渲染当前用户的 personalResult(待提交 / 已提交 / 生成中 / 完成) */
function MyResult({
  taskId,
  canEdit,
  baseResultId,
}: {
  taskId: number;
  canEdit: boolean;
  baseResultId?: number;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const { data, isLoading, error } = useQuery(personalResultQueryOptions(taskId, true));

  const submitMu = useMutation({
    mutationFn: () => submitPersonalResult(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: personalResultQueryKey(taskId) });
      message.success(t("summary.personal.submittedToast"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.personal.submitFailed")),
  });

  if (isLoading)
    return <p className="text-xs text-text-tertiary">{tr("summary.personal.loadMine")}</p>;
  if (error || !data)
    return <p className="text-xs text-text-tertiary">{tr("summary.personal.noMine")}</p>;

  const hasCitations = !!data.citations && data.citations.length > 0;

  const handleEditSaved = () => {
    setEditing(false);
    void qc.invalidateQueries({ queryKey: personalResultQueryKey(taskId) });
    void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-3">
      {editing && baseResultId ? (
        <SummaryEditor
          taskId={taskId}
          baseResultId={baseResultId}
          initialContent={data.content || ""}
          title={tr("summary.detail.mySummaryPlain")}
          onSave={handleEditSaved}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex min-h-9 items-center justify-between gap-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              onClick={() => setExpanded((prev) => !prev)}
            >
              <ChevronDown
                size={14}
                className={`shrink-0 text-text-tertiary transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
              <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">
                {tr("summary.detail.mySummaryPlain")}
              </h3>
            </button>
            {canEdit && baseResultId && data.content ? (
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  onClick={() => setEditing(true)}
                >
                  <Edit3 size={13} />
                  {tr("summary.common.edit")}
                </Button>
              </div>
            ) : null}
          </div>
          {expanded ? (
            data.content ? (
              hasCitations ? (
                <CitationText content={data.content} citations={data.citations!} />
              ) : (
                <SummaryContent content={data.content} />
              )
            ) : (
              <p className="text-xs italic text-text-tertiary">
                {tr("summary.personal.emptyContent")}
              </p>
            )
          ) : null}
        </>
      )}
      {data.worker_status === 0 && data.content && !editing ? (
        <div className="flex justify-end">
          <Button
            type="primary"
            theme="solid"
            size="small"
            loading={submitMu.isPending}
            onClick={() => submitMu.mutate()}
          >
            {tr("summary.personal.submitMine")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 个人模式总结面板(Wave 3c BY_PERSON 专用)。
 */
export function PersonalSection({ detail }: PersonalSectionProps) {
  const tr = useT();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const my = findMyParticipant(detail, myUid);
  const canEdit =
    detail.status === TaskStatus.COMPLETED && !!detail.permissions?.can_edit && !!detail.result_id;

  // 当前用户被邀且未确认
  if (my?.status === ParticipantStatus.PENDING) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <ConfirmStep taskId={detail.task_id} onConfirmed={() => undefined} />
      </div>
    );
  }

  // 当前用户已拒绝
  if (my?.status === ParticipantStatus.DECLINED) {
    const declinedAtLabel = my.confirmed_at
      ? tr("summary.personal.declinedYouAt", {
          values: { time: new Date(my.confirmed_at).toLocaleString("zh-CN") },
        })
      : tr("summary.personal.declinedYou");
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="rounded-md border border-border-subtle bg-bg-surface p-3 text-sm text-text-tertiary">
          {declinedAtLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <MyResult taskId={detail.task_id} canEdit={canEdit} baseResultId={detail.result_id} />
    </div>
  );
}
