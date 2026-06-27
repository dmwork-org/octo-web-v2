import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Message, MessageText } from "wukongimjssdk";
import {
  ChevronDown,
  Clock,
  LogOut,
  Loader2,
  MessageSquareText,
  RefreshCcw,
  Send,
  Trash2,
  UserMinus,
  UsersRound,
  X as XIcon,
} from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { authStore } from "@/features/base/stores/auth";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { addMatterComment } from "@/features/matter/api/matter.api";
import {
  cancelSummary,
  createSchedule,
  deleteSummary,
  getMembers,
  getSchedule,
  leaveSummary,
  removeMember,
  regenerateSummary,
  toggleSchedule,
  updateSchedule,
} from "@/features/summary/api/summary.api";
import {
  personalResultQueryOptions,
  summaryDetailQueryKey,
  summaryDetailQueryOptions,
} from "@/features/summary/queries/summaries.query";
import { SummaryContent } from "@/features/summary/components/summary-content";
import { ScheduleConfigModal } from "@/features/summary/components/schedule-config-modal";
import { CitationText } from "@/features/summary/components/citation-text";
import { MatterPickerModal } from "@/features/summary/components/matter-picker-modal";
import { PersonalSection } from "@/features/summary/components/personal-section";
import {
  SourceType,
  SummaryMode,
  TaskStatus,
  type MemberStatus,
  type ScheduleConfig,
  type SourceItem,
  type TaskStatusType,
} from "@/features/summary/types/summary.types";
import {
  describeSchedule,
  formatNextRunAt,
  scheduleItemToConfig,
  scheduleToParams,
} from "@/features/summary/utils/summary-schedule";
import { splitSummaryText } from "@/features/summary/utils/split-message";

interface SummaryDetailProps {
  taskId: number | null;
  onDeleted: () => void;
}

function cleanForwardContent(content: string): string {
  return content
    .replace(/\[\d+\]/g, "")
    .replace(/  +/g, " ")
    .trim();
}

function buildForwardMessages(content: string): Message[] {
  return splitSummaryText(cleanForwardContent(content)).map((chunk) => {
    const message = new Message();
    message.content = new MessageText(chunk);
    return message;
  });
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-sm bg-bg-elevated ${className}`} />;
}

function SummaryDetailSkeleton({ label }: { label: string }) {
  return (
    <section aria-label={label} className="flex flex-1 flex-col overflow-hidden bg-bg-surface">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-3">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-5 w-2/5" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-7" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <article className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-8 py-6">
          <div>
            <div className="flex flex-col gap-3">
              <SkeletonBlock className="h-6 w-3/5" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-11/12" />
              <SkeletonBlock className="h-4 w-4/5" />
              <SkeletonBlock className="mt-2 h-5 w-2/5" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-10/12" />
              <SkeletonBlock className="h-4 w-7/12" />
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function SummaryProcessingPanel({ status }: { status: TaskStatusType }) {
  const tr = useT();
  const isWaitingConfirm = status === TaskStatus.WAITING_CONFIRM;
  const title = isWaitingConfirm
    ? tr("summary.detail.waitingConfirmTitle")
    : tr("summary.detail.processingTitle");
  const description = isWaitingConfirm
    ? tr("summary.detail.waitingConfirmDesc")
    : tr("summary.detail.processingDesc");

  return (
    <section
      aria-live="polite"
      className="flex min-h-[236px] flex-col items-center justify-center rounded-md border border-border-subtle bg-bg-base px-6 py-12 text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border-default bg-bg-surface shadow-sm">
        <Loader2 size={28} className="animate-spin text-text-primary" />
      </div>
      <p className="mt-3 text-base leading-6 font-semibold text-text-primary">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-text-tertiary">{description}</p>
    </section>
  );
}

function SummarySourcesPanel({ sources }: { sources: SourceItem[] }) {
  const tr = useT();
  const sourceIcon = (sourceType: SourceItem["source_type"]) => {
    if (sourceType === SourceType.GROUP_CHAT) return <UsersRound size={14} />;
    return <MessageSquareText size={14} />;
  };

  return (
    <section className="shrink-0 overflow-hidden rounded-md border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <MessageSquareText size={15} className="shrink-0 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">
          {tr("summary.detail.selectedSourcesTitle")}
        </h3>
      </div>
      {sources.length > 0 ? (
        <div className="flex max-h-40 flex-col divide-y divide-border-subtle overflow-y-auto bg-bg-base">
          {sources.map((source) => (
            <div
              key={`${source.source_type}-${source.source_id}`}
              className="flex min-h-10 items-center gap-2 px-4 py-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border-default bg-bg-surface text-text-tertiary">
                {sourceIcon(source.source_type)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                {source.source_name || source.source_id}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-center text-sm text-text-tertiary">
          {tr("summary.detail.emptyContent")}
        </div>
      )}
    </section>
  );
}

function MemberStatusPanel({
  members,
  myUid,
  creatorId,
  canRemove,
  removingUid,
  onRemove,
}: {
  members: MemberStatus[];
  myUid: string;
  creatorId?: string;
  canRemove: boolean;
  removingUid?: string;
  onRemove: (uid: string) => void;
}) {
  const tr = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  if (members.length === 0) return null;
  return (
    <>
      <section className="rounded-md border border-border-subtle bg-bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {tr("summary.detail.memberStatus")}
          </h3>
          <span className="text-xs text-text-tertiary">
            {tr("summary.detail.submittedPeople", {
              values: { count: members.filter((member) => !!member.submitted_at).length },
            })}
          </span>
        </div>
        <div className="divide-y divide-border-subtle">
          {members.map((member) => {
            const content = member.content?.trim() ?? "";
            const isExpanded = !!expanded[member.user_id];
            const canRemoveMember =
              canRemove && member.user_id !== myUid && member.user_id !== creatorId;
            return (
              <div key={member.user_id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!content}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover disabled:opacity-30"
                    aria-label={
                      isExpanded ? tr("summary.detail.collapse") : tr("summary.detail.expandAll")
                    }
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [member.user_id]: !prev[member.user_id],
                      }))
                    }
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {member.user_name || member.user_id}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {content
                        ? tr("summary.detail.submitSuccess")
                        : tr("summary.detail.waitingSubmit", {
                            values: { name: member.user_name || member.user_id },
                          })}
                    </div>
                  </div>
                  {canRemoveMember ? (
                    <Button
                      type="danger"
                      theme="borderless"
                      size="small"
                      loading={removingUid === member.user_id}
                      onClick={() => setConfirmRemoveUid(member.user_id)}
                    >
                      <UserMinus size={13} />
                      {tr("summary.detail.removeMember")}
                    </Button>
                  ) : null}
                </div>
                {isExpanded && content ? (
                  <div className="mt-3 rounded-md bg-bg-base p-3">
                    <CitationText
                      content={content}
                      citations={member.citations ?? []}
                      hidePlainCitations={member.user_id !== myUid}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <ConfirmDialog
        open={!!confirmRemoveUid}
        onOpenChange={(next) => {
          if (!next) setConfirmRemoveUid(null);
        }}
        title={tr("summary.detail.removeMember")}
        content={tr("summary.detail.removeMemberConfirm")}
        okText={tr("summary.detail.removeMember")}
        cancelText={tr("summary.common.cancel")}
        okDanger
        okLoading={!!confirmRemoveUid && removingUid === confirmRemoveUid}
        onOk={() => {
          if (confirmRemoveUid) onRemove(confirmRemoveUid);
          setConfirmRemoveUid(null);
        }}
      />
    </>
  );
}

/**
 * 总结详情面板。
 */
export function SummaryDetail({ taskId, onDeleted }: SummaryDetailProps) {
  const tr = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [forwardMessages, setForwardMessages] = useState<Message[] | null>(null);
  const [matterPickerOpen, setMatterPickerOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [scheduleConfigOpen, setScheduleConfigOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [regenerateTopic, setRegenerateTopic] = useState("");
  const { data, isLoading, isFetching, error } = useQuery(summaryDetailQueryOptions(taskId));
  const scheduleId = data?.schedule_id && data.schedule_id > 0 ? data.schedule_id : null;
  const { data: scheduleItem, isLoading: scheduleLoading } = useQuery({
    queryKey: ["summary", "schedule", scheduleId],
    queryFn: () => getSchedule(scheduleId!),
    enabled: scheduleId !== null,
    staleTime: 30 * 1000,
  });
  const { data: personalResult } = useQuery(
    personalResultQueryOptions(taskId, data?.summary_mode === SummaryMode.BY_PERSON),
  );
  const { data: members = [] } = useQuery({
    queryKey: ["summary", "members", taskId],
    queryFn: () => getMembers(taskId!),
    enabled: taskId !== null && data?.summary_mode === SummaryMode.BY_PERSON,
    staleTime: 15 * 1000,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["summary", "list"] });
    if (taskId !== null) {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
    }
    void qc.invalidateQueries({ queryKey: ["summary", "schedule"] });
  };

  const regenMu = useMutation({
    mutationFn: (topic: string) => regenerateSummary(taskId!, { topic }),
    onSuccess: () => {
      setRegenerateOpen(false);
      invalidate();
      message.success(t("summary.detail.regenerateStarted"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.regenerateFailed")),
  });

  const cancelMu = useMutation({
    mutationFn: () => cancelSummary(taskId!),
    onSuccess: () => {
      invalidate();
      message.success(t("summary.detail.cancelledToast"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.cancelFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: () => deleteSummary(taskId!),
    onSuccess: () => {
      setDeleteConfirmOpen(false);
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      message.success(t("summary.detail.deletedToast"));
      onDeleted();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.deleteFailed")),
  });

  const leaveMu = useMutation({
    mutationFn: () => leaveSummary(taskId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["summary", "list"] });
      message.success(t("summary.detail.leaveSuccess"));
      onDeleted();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.leaveFailed")),
  });

  const removeMemberMu = useMutation({
    mutationFn: (uid: string) => removeMember(taskId!, uid),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["summary", "members", taskId] });
      message.success(t("summary.detail.removeMemberSuccess"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.removeMemberFailed")),
  });

  const forwardMatterMu = useMutation({
    mutationFn: ({
      matterId,
      content,
    }: {
      matterId: string;
      matterTitle: string;
      content: string;
    }) => addMatterComment(matterId, content),
    onSuccess: (_void, vars) => {
      setMatterPickerOpen(false);
      message.success(
        t("summary.detail.forwardedToMatter", { values: { title: vars.matterTitle } }),
      );
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.forwardFailed")),
  });

  const saveScheduleMu = useMutation({
    mutationFn: async (config: ScheduleConfig) => {
      if (!data) throw new Error(t("summary.detail.loadFailed"));
      const params = scheduleToParams(config);
      if (scheduleItem) {
        const updated = await updateSchedule(scheduleItem.schedule_id, {
          ...params,
          scope: "task",
          task_id: data.task_id,
        });
        if (scheduleItem.is_active === false) {
          await toggleSchedule(updated.schedule_id, true);
        }
        return updated;
      }
      return createSchedule({
        title: data.title,
        summary_mode: data.summary_mode,
        ...params,
        time_range_type: 2,
        sources: data.sources,
        scope: "task",
        task_id: data.task_id,
      });
    },
    onSuccess: () => {
      setScheduleConfigOpen(false);
      invalidate();
      message.success(
        scheduleItem ? t("summary.detail.scheduleSaved") : t("summary.detail.scheduleCreated"),
      );
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.common.saveFailed")),
  });

  const disableScheduleMu = useMutation({
    mutationFn: () => toggleSchedule(scheduleItem!.schedule_id, false),
    onSuccess: () => {
      setScheduleConfigOpen(false);
      invalidate();
      message.success(t("summary.detail.scheduleDisabled"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.common.operationFailed")),
  });

  if (taskId === null) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-text-tertiary">
        {tr("summary.detail.empty")}
      </section>
    );
  }
  if (isLoading || (isFetching && data?.task_id !== taskId)) {
    return <SummaryDetailSkeleton label={tr("summary.detail.loading")} />;
  }
  if (error || !data) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center text-sm text-error">
        {tr("summary.detail.loadFailed")}
      </section>
    );
  }

  const isFailed = data.status === TaskStatus.FAILED;
  const isCompleted = data.status === TaskStatus.COMPLETED;
  const isProcessing =
    data.status === TaskStatus.PROCESSING ||
    data.status === TaskStatus.PENDING ||
    data.status === TaskStatus.WAITING_CONFIRM;
  const isGenerating = data.status === TaskStatus.PROCESSING || data.status === TaskStatus.PENDING;
  const canRegen = isCompleted || isFailed;
  const canCancel = isProcessing;
  const citations = data.result?.citations;
  const hasCitations = !!citations && citations.length > 0;
  const isPersonalMode = data.summary_mode === SummaryMode.BY_PERSON;
  const resultContent = data.result?.content ?? "";
  const hasTeamSummary = isPersonalMode && resultContent.trim().length > 0;
  const personalReady = isPersonalMode && !!personalResult?.content?.trim();
  const canEdit = !!data.permissions?.can_edit;
  const isCreator = data.creator_id != null && data.creator_id === myUid;
  const isParticipant = data.participants.some((participant) => participant.user_id === myUid);
  const canDelete = isCreator;
  const canLeave = !isCreator && isParticipant;
  const hasActiveSchedule = !!scheduleItem && scheduleItem.is_active !== false;
  const hasSchedule = hasActiveSchedule || (!scheduleItem && !!scheduleId);
  const scheduleSummary =
    scheduleItem && scheduleItem.is_active !== false
      ? `${describeSchedule(scheduleItem, t)}${
          scheduleItem.next_run_at
            ? ` · ${tr("summary.detail.scheduleNextRun", {
                values: { time: formatNextRunAt(scheduleItem.next_run_at) },
              })}`
            : ""
        }`
      : "";

  const openForwardToChat = () => {
    if (!resultContent.trim()) {
      message.warning(t("summary.detail.noForwardContent"));
      return;
    }
    const messages = buildForwardMessages(resultContent);
    if (messages.length === 0) {
      message.warning(t("summary.detail.noForwardContent"));
      return;
    }
    setForwardMessages(messages);
  };

  const openForwardToMatter = () => {
    if (!resultContent.trim()) {
      message.warning(t("summary.detail.noForwardContent"));
      return;
    }
    setMatterPickerOpen(true);
  };

  const openRegenerate = () => {
    setRegenerateTopic(data.title || "");
    setRegenerateOpen(true);
  };

  const submitRegenerate = () => {
    const topic = regenerateTopic.trim();
    if (!topic || regenMu.isPending) return;
    regenMu.mutate(topic);
  };

  const openScheduleConfig = () => {
    setScheduleConfigOpen(true);
  };

  return (
    <>
      <section className="flex flex-1 flex-col overflow-hidden bg-bg-surface">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] leading-6 font-semibold text-text-primary">
              {data.title}
            </h1>
            {scheduleItem ? (
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-tertiary">
                <Clock
                  size={13}
                  className={scheduleItem.is_active === false ? "text-text-tertiary" : "text-brand"}
                />
                <span className="truncate">
                  {scheduleItem.is_active === false
                    ? tr("summary.detail.scheduleDisabledHint")
                    : tr("summary.detail.schedulePrefix", { values: { text: scheduleSummary } })}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canEdit ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                loading={scheduleLoading || saveScheduleMu.isPending || disableScheduleMu.isPending}
                onClick={openScheduleConfig}
              >
                <Clock size={13} />
                {tr(hasSchedule ? "summary.detail.editSchedule" : "summary.detail.setSchedule")}
              </Button>
            ) : null}
            {isCompleted ? (
              <>
                <Button type="tertiary" theme="borderless" size="small" onClick={openForwardToChat}>
                  <Send size={13} />
                  {tr("summary.detail.forwardToChat")}
                </Button>
                <Button
                  type="tertiary"
                  theme="borderless"
                  size="small"
                  loading={forwardMatterMu.isPending}
                  onClick={openForwardToMatter}
                >
                  <Send size={13} />
                  {tr("summary.detail.forwardToMatter")}
                </Button>
              </>
            ) : null}
            {canRegen ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                loading={regenMu.isPending}
                onClick={openRegenerate}
              >
                <RefreshCcw size={13} />
                {tr("summary.detail.regenerate")}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="tertiary"
                theme="borderless"
                size="small"
                loading={cancelMu.isPending}
                onClick={() => cancelMu.mutate()}
              >
                <XIcon size={13} />
                {tr("summary.detail.cancelTask")}
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="danger"
                theme="borderless"
                size="small"
                iconOnly
                aria-label={tr("summary.common.delete")}
                loading={deleteMu.isPending}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 size={14} />
              </Button>
            ) : canLeave ? (
              <Button
                type="danger"
                theme="borderless"
                size="small"
                loading={leaveMu.isPending}
                onClick={() => leaveMu.mutate()}
              >
                <LogOut size={13} />
                {tr("summary.detail.leaveTask")}
              </Button>
            ) : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <article className="mx-auto flex w-full max-w-[920px] flex-col gap-5 px-8 py-6">
              {isGenerating && !personalReady ? (
                <SummaryProcessingPanel status={data.status} />
              ) : (
                <>
                  {isPersonalMode ? (
                    <>
                      <PersonalSection detail={data} />
                      {hasTeamSummary ? (
                        <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-4">
                          <h3 className="mb-3 text-sm font-semibold text-text-primary">
                            {tr("summary.detail.teamSummary")}
                          </h3>
                          <CitationText
                            content={resultContent}
                            citations={data.result?.citations ?? []}
                            teamCitations={data.result?.team_citations ?? []}
                            members={members}
                            hidePlainCitations
                          />
                        </div>
                      ) : null}
                      <MemberStatusPanel
                        members={members}
                        myUid={myUid}
                        creatorId={data.creator_id}
                        canRemove={!!data.permissions?.can_remove_member}
                        removingUid={removeMemberMu.variables}
                        onRemove={(uid) => removeMemberMu.mutate(uid)}
                      />
                    </>
                  ) : null}

                  {!isPersonalMode ? (
                    <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-4">
                      {isProcessing ? (
                        <SummaryProcessingPanel status={data.status} />
                      ) : isFailed ? (
                        <p className="text-sm text-error">
                          {data.error_message ?? tr("summary.detail.failedFallback")}
                        </p>
                      ) : data.result ? (
                        hasCitations ? (
                          <CitationText content={data.result.content} citations={citations!} />
                        ) : (
                          <SummaryContent content={data.result.content} />
                        )
                      ) : !isPersonalMode ? (
                        <p className="text-sm italic text-text-tertiary">
                          {tr("summary.detail.emptyContent")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </article>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-8 py-3">
            <div className="mx-auto w-full max-w-[920px]">
              <SummarySourcesPanel sources={data.sources} />
            </div>
          </div>
        </div>
      </section>
      <ForwardModal
        open={!!forwardMessages}
        messages={forwardMessages ?? []}
        defaultMode="per"
        onClose={() => setForwardMessages(null)}
      />
      <MatterPickerModal
        open={matterPickerOpen}
        onClose={() => setMatterPickerOpen(false)}
        onSelect={(matterId, matterTitle) => {
          forwardMatterMu.mutate({
            matterId,
            matterTitle,
            content: resultContent,
          });
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={tr("summary.summaryCard.deleteTitle")}
        content={tr("summary.detail.confirmDelete")}
        okText={tr("summary.common.delete")}
        cancelText={tr("summary.common.cancel")}
        okDanger
        okLoading={deleteMu.isPending}
        onOk={() => {
          if (!deleteMu.isPending) deleteMu.mutate();
        }}
      />
      <ScheduleConfigModal
        open={scheduleConfigOpen}
        value={
          scheduleItem
            ? scheduleItemToConfig(scheduleItem)
            : { unit: "week", every: 1, time: "09:00" }
        }
        onConfirm={(config) => saveScheduleMu.mutate(config)}
        onCancel={() => setScheduleConfigOpen(false)}
        hasExisting={hasActiveSchedule}
        onDisable={() => {
          if (scheduleItem && !disableScheduleMu.isPending) disableScheduleMu.mutate();
        }}
        disabling={disableScheduleMu.isPending}
      />
      <BaseDialog
        open={regenerateOpen}
        onOpenChange={(next) => {
          if (!next) setRegenerateOpen(false);
        }}
        size="md"
        title={tr("summary.detail.regenerateEditTitle")}
        contentClassName="gap-2 p-4"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              disabled={regenMu.isPending}
              onClick={() => setRegenerateOpen(false)}
            >
              {tr("summary.common.cancel")}
            </Button>
            <Button
              type="primary"
              theme="solid"
              size="small"
              loading={regenMu.isPending}
              disabled={!regenerateTopic.trim()}
              onClick={submitRegenerate}
            >
              {tr("summary.detail.regenerate")}
            </Button>
          </div>
        }
      >
        <label
          htmlFor="summary-regenerate-topic"
          className="text-xs font-medium text-text-secondary"
        >
          {tr("summary.detail.regenerateTopicLabel")}
        </label>
        <textarea
          id="summary-regenerate-topic"
          value={regenerateTopic}
          onChange={(event) => setRegenerateTopic(event.target.value.slice(0, 1000))}
          className="min-h-24 resize-y rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm leading-6 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
      </BaseDialog>
    </>
  );
}
