import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Message, MessageText } from "wukongimjssdk";
import {
  CheckCircle2,
  Clock,
  Edit3,
  LogOut,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCcw,
  Send,
  TriangleAlert,
  Trash2,
  UserMinus,
  UsersRound,
  XCircle,
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
  addMembers,
  cancelSummary,
  createSchedule,
  deleteSummary,
  getMembers,
  getSchedule,
  leaveSummary,
  removeMember,
  regenerateSummary,
  submitPersonalResult,
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
import { ParticipantPicker } from "@/features/summary/components/participant-picker";
import { SummaryEditor } from "@/features/summary/components/summary-editor";
import {
  SourceType,
  SummaryMode,
  ParticipantStatus,
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

function formatSummaryDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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

function SummaryFailedPanel({
  errorMessage,
  taskNo,
  createdAt,
}: {
  errorMessage?: string | null;
  taskNo: string;
  createdAt: string;
}) {
  const tr = useT();
  return (
    <section className="my-2 flex flex-col items-center rounded-md border border-error/25 bg-error/10 px-8 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-error/25 bg-bg-surface text-error">
        <TriangleAlert size={30} />
      </div>
      <h3 className="mt-4 text-base leading-6 font-semibold text-error">
        {tr("summary.detail.failedTitle")}
      </h3>
      {errorMessage ? (
        <div className="mt-4 w-full rounded-md border border-border-subtle bg-bg-surface px-4 py-3 text-sm leading-6 text-text-secondary">
          {errorMessage}
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-1 text-xs leading-5 text-text-tertiary">
        <span>{tr("summary.detail.taskNo", { values: { taskNo } })}</span>
        <span>
          {tr("summary.detail.createdAt", { values: { time: formatSummaryDate(createdAt) } })}
        </span>
      </div>
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
  canAdd,
  removingUid,
  existingParticipantIds,
  onAdd,
  onRemove,
}: {
  members: MemberStatus[];
  myUid: string;
  creatorId?: string;
  canRemove: boolean;
  canAdd: boolean;
  removingUid?: string;
  existingParticipantIds: string[];
  onAdd: (uids: string[]) => void;
  onRemove: (uid: string) => void;
}) {
  const tr = useT();
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  if (members.length === 0) return null;
  const submittedCount = members.filter((member) => !!member.submitted_at).length;
  const statusConfig: Record<string, { icon: ReactNode; label: string; className: string }> = {
    pending: {
      icon: <Clock size={13} />,
      label: tr("summary.memberStatus.pending"),
      className: "border-warning/25 bg-warning/10 text-warning",
    },
    accepted: {
      icon: <CheckCircle2 size={13} />,
      label: tr("summary.memberStatus.accepted"),
      className: "border-success/25 bg-success/10 text-success",
    },
    declined: {
      icon: <XCircle size={13} />,
      label: tr("summary.memberStatus.declined"),
      className: "border-error/25 bg-error/10 text-error",
    },
    processing: {
      icon: <Loader2 size={13} className="animate-spin" />,
      label: tr("summary.memberStatus.processing"),
      className: "border-border-default bg-bg-elevated text-text-secondary",
    },
    completed: {
      icon: <CheckCircle2 size={13} />,
      label: tr("summary.memberStatus.completed"),
      className: "border-success/25 bg-success/10 text-success",
    },
    submitted: {
      icon: <CheckCircle2 size={13} />,
      label: tr("summary.memberStatus.submitted"),
      className: "border-success/25 bg-success/10 text-success",
    },
  };
  return (
    <>
      <section className="rounded-md border border-border-subtle bg-bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              {tr("summary.detail.memberStatus")}
            </h3>
            <span className="text-xs text-text-tertiary">
              {tr("summary.detail.submittedPeople", { values: { count: submittedCount } })}
            </span>
          </div>
          {canAdd ? (
            <ParticipantPicker
              value={existingParticipantIds}
              onChange={(uids) => {
                const existing = new Set(existingParticipantIds);
                const next = uids.filter((uid) => !existing.has(uid));
                if (next.length > 0) onAdd(next);
              }}
              trigger={({ open }) => (
                <Button type="tertiary" theme="borderless" size="small" onClick={open}>
                  <Plus size={13} />
                  {tr("summary.detail.addMember")}
                </Button>
              )}
            />
          ) : null}
        </div>
        <div className="divide-y divide-border-subtle">
          {members.map((member) => {
            const canRemoveMember =
              canRemove && member.user_id !== myUid && member.user_id !== creatorId;
            const status = statusConfig[member.status] ?? statusConfig.pending;
            return (
              <div key={member.user_id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {member.user_name || member.user_id}
                    </div>
                    {member.submitted_at ? (
                      <div className="text-xs text-text-tertiary">
                        {formatSummaryDate(member.submitted_at)}
                      </div>
                    ) : null}
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-sm border px-2 py-0.5 text-xs ${status.className}`}
                  >
                    {status.icon}
                    {status.label}
                  </span>
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

function ParticipantReportsPanel({
  taskId,
  resultId,
  members,
  myUid,
  personalContent,
  personalCitations,
  showMyPendingSubmit,
  canEditPersonal,
  submitting,
  onSubmitMine,
  onSaved,
}: {
  taskId: number;
  resultId?: number;
  members: MemberStatus[];
  myUid: string;
  personalContent: string;
  personalCitations: MemberStatus["citations"];
  showMyPendingSubmit: boolean;
  canEditPersonal: boolean;
  submitting: boolean;
  onSubmitMine: () => void;
  onSaved: () => void;
}) {
  const tr = useT();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingPersonal, setEditingPersonal] = useState(false);

  if (members.length <= 1) return null;

  const submitted = members.filter((member) => !!member.submitted_at && !!member.content?.trim());
  const declined = members.filter((member) => member.status === "declined");
  const pending = members.filter(
    (member) => member.status !== "declined" && (!member.submitted_at || !member.content?.trim()),
  );

  if (submitted.length === 0 && declined.length === 0 && pending.length === 0) return null;

  const submittedSorted = [
    ...submitted.filter((member) => member.user_id === myUid),
    ...submitted.filter((member) => member.user_id !== myUid),
  ];
  const pendingOthers = showMyPendingSubmit
    ? pending.filter((member) => member.user_id !== myUid)
    : pending;

  const toggle = (uid: string) => {
    setExpanded((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const renderContent = (member: MemberStatus) => {
    const content = member.content?.trim() ?? "";
    const isMe = member.user_id === myUid;
    const displayContent = isMe ? content : content.replace(/\[\d+\]/g, "");
    const displayCitations = isMe ? (member.citations ?? []) : [];
    const needsTruncate = displayContent.length > 100;
    const isExpanded = !!expanded[member.user_id];
    const shownContent =
      isExpanded || !needsTruncate ? displayContent : `${displayContent.slice(0, 100)}...`;

    return (
      <div
        key={member.user_id}
        className="rounded-md border border-border-subtle bg-bg-surface p-4"
      >
        <div
          className={`flex min-h-8 items-center gap-2 ${needsTruncate ? "cursor-pointer" : ""}`}
          onClick={() => {
            if (needsTruncate) toggle(member.user_id);
          }}
        >
          <span className="truncate text-sm font-semibold text-text-primary">
            {member.user_name || member.user_id}
          </span>
          <span className="text-text-tertiary">·</span>
          <span className="shrink-0 text-xs text-text-tertiary">
            {formatSummaryDate(member.submitted_at)}
          </span>
          {isMe && canEditPersonal ? (
            <Button
              type="tertiary"
              theme="borderless"
              size="small"
              className="ml-auto"
              onClick={(event) => {
                event.stopPropagation();
                setEditingPersonal(true);
              }}
            >
              <Edit3 size={13} />
              {tr("summary.detail.editMyReport")}
            </Button>
          ) : null}
        </div>
        {isMe && editingPersonal ? (
          <div className="mt-3">
            <SummaryEditor
              mode="personal"
              taskId={taskId}
              baseResultId={resultId}
              initialContent={content}
              title={tr("summary.detail.mySummaryPlain")}
              onSave={() => {
                setEditingPersonal(false);
                onSaved();
              }}
              onCancel={() => setEditingPersonal(false)}
            />
          </div>
        ) : (
          <div className="mt-3 text-sm leading-7 text-text-primary">
            {isMe ? (
              <CitationText content={shownContent} citations={displayCitations} />
            ) : (
              <SummaryContent content={shownContent} />
            )}
          </div>
        )}
        {needsTruncate && !editingPersonal ? (
          <button
            type="button"
            className="mt-2 cursor-pointer text-xs text-text-tertiary hover:text-text-primary"
            onClick={() => toggle(member.user_id)}
          >
            {isExpanded ? tr("summary.detail.collapse") : tr("summary.detail.expandAll")}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">
        {tr("summary.detail.participantReports")}
      </h3>
      {submittedSorted.map(renderContent)}
      {showMyPendingSubmit ? (
        <div className="rounded-md border border-info/30 bg-info/10 p-4">
          <div className="flex min-h-8 items-center gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">
              {tr("summary.detail.mySubmitRowName")}
            </span>
            <Button
              type="primary"
              theme="solid"
              size="small"
              className="ml-auto bg-info font-semibold text-white shadow-sm hover:bg-info/90"
              loading={submitting}
              onClick={onSubmitMine}
            >
              {tr("summary.detail.submitToAll")}
            </Button>
          </div>
          {personalContent.trim() ? (
            <div className="mt-3">
              <CitationText content={personalContent} citations={personalCitations ?? []} />
            </div>
          ) : null}
        </div>
      ) : null}
      {pendingOthers.map((member) => (
        <div
          key={member.user_id}
          className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          <Clock size={14} />
          <span>
            {tr("summary.detail.waitingSubmit", {
              values: { name: member.user_name || member.user_id },
            })}
          </span>
        </div>
      ))}
      {declined.map((member) => (
        <div
          key={member.user_id}
          className="flex items-center gap-2 rounded-md border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
        >
          <XCircle size={14} />
          <span>
            {member.user_name || member.user_id}
            <span className="text-text-tertiary"> · </span>
            {tr("summary.confirmPage.declined")}
          </span>
        </div>
      ))}
    </section>
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
  const [editingTeamSummary, setEditingTeamSummary] = useState(false);
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
      void qc.invalidateQueries({ queryKey: ["summary", "personal", taskId] });
      void qc.invalidateQueries({ queryKey: ["summary", "members", taskId] });
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

  const addMembersMu = useMutation({
    mutationFn: (uids: string[]) => addMembers(taskId!, uids),
    onSuccess: () => {
      invalidate();
      message.success(t("summary.detail.addMemberSuccess"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.addMemberFailed")),
  });

  const submitPersonalMu = useMutation({
    mutationFn: () => submitPersonalResult(taskId!),
    onSuccess: () => {
      invalidate();
      message.success(t("summary.detail.submitSuccess"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("summary.detail.submitFailed")),
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
      const isMultiPerson =
        data.summary_mode === SummaryMode.BY_PERSON &&
        (data.participants.length > 0 ? data.participants.length > 1 : members.length > 1);
      const params = scheduleToParams({
        ...config,
        confirm_policy: isMultiPerson ? 1 : undefined,
      });
      const scheduleParticipants =
        data.participants.length > 0
          ? data.participants.map((participant) => ({
              user_id: participant.user_id,
              user_name: participant.user_name,
            }))
          : members.map((member) => ({
              user_id: member.user_id,
              user_name: member.user_name,
            }));
      const participants =
        scheduleParticipants.length > 0 ? { participants: scheduleParticipants } : {};
      if (scheduleItem) {
        const updated = await updateSchedule(scheduleItem.schedule_id, {
          ...params,
          scope: "task",
          task_id: data.task_id,
          ...participants,
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
        ...participants,
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
  const participantCount = data.participants.length > 0 ? data.participants.length : members.length;
  const isMultiCollab = isPersonalMode && participantCount > 1;
  const hasTeamSummary = isMultiCollab && resultContent.trim().length > 0;
  const personalReady = isPersonalMode && !!personalResult?.content?.trim();
  const canSchedule = !!data.permissions?.can_schedule;
  const canEditTeam = !!data.permissions?.can_edit_team;
  const canEditPersonal = !!data.permissions?.can_edit_personal;
  const isCreator = data.creator_id != null && data.creator_id === myUid;
  const isParticipant = data.participants.some((participant) => participant.user_id === myUid);
  const myParticipant = data.participants.find((participant) => participant.user_id === myUid);
  const shouldShowPersonalSection =
    !isMultiCollab ||
    myParticipant?.status === ParticipantStatus.PENDING ||
    myParticipant?.status === ParticipantStatus.DECLINED;
  const canDelete = isCreator;
  const canLeave = !isCreator && isParticipant;
  const showMyPendingSubmit =
    isMultiCollab &&
    personalResult?.worker_status === 2 &&
    !personalResult.submitted_at &&
    members.length > 1 &&
    !editingTeamSummary;
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

  const submitMySummary = () => {
    if (submitPersonalMu.isPending) return;
    submitPersonalMu.mutate();
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
            {canSchedule ? (
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
                      {isMultiCollab && showMyPendingSubmit ? (
                        <div className="flex items-center gap-3 rounded-md border border-l-4 border-info/30 border-l-info bg-info/10 px-4 py-3 text-sm text-text-primary">
                          <MessageSquareText size={16} className="shrink-0 text-info" />
                          <span className="min-w-0 flex-1">
                            {tr("summary.detail.mySubmitHint")}
                          </span>
                          <Button
                            type="primary"
                            theme="solid"
                            size="small"
                            className="bg-info font-semibold text-white shadow-sm hover:bg-info/90"
                            loading={submitPersonalMu.isPending}
                            onClick={submitMySummary}
                          >
                            {tr("summary.detail.submitToAll")}
                          </Button>
                        </div>
                      ) : null}
                      {shouldShowPersonalSection ? <PersonalSection detail={data} /> : null}
                      {hasTeamSummary ? (
                        <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-4">
                          {editingTeamSummary && data.result_id ? (
                            <SummaryEditor
                              taskId={data.task_id}
                              baseResultId={data.result_id}
                              initialContent={resultContent}
                              title={tr("summary.detail.teamSummary")}
                              onSave={() => {
                                setEditingTeamSummary(false);
                                invalidate();
                              }}
                              onCancel={() => setEditingTeamSummary(false)}
                            />
                          ) : (
                            <>
                              <div className="mb-3 flex items-center justify-between gap-2">
                                <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">
                                  {tr("summary.detail.teamSummary")}
                                </h3>
                                {canEditTeam && isCompleted && data.result_id ? (
                                  <Button
                                    type="tertiary"
                                    theme="borderless"
                                    size="small"
                                    onClick={() => setEditingTeamSummary(true)}
                                  >
                                    <Edit3 size={13} />
                                    {tr("summary.detail.editTeamSummary")}
                                  </Button>
                                ) : null}
                              </div>
                              <CitationText
                                content={resultContent}
                                citations={data.result?.citations ?? []}
                                teamCitations={data.result?.team_citations ?? []}
                                members={members}
                                hidePlainCitations
                              />
                            </>
                          )}
                        </div>
                      ) : isMultiCollab && data.status === TaskStatus.PROCESSING ? (
                        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface p-4 text-sm text-text-secondary">
                          <Loader2 size={15} className="animate-spin" />
                          {tr("summary.detail.teamGenerating")}
                        </div>
                      ) : null}
                      {isMultiCollab ? (
                        <>
                          <MemberStatusPanel
                            members={members}
                            myUid={myUid}
                            creatorId={data.creator_id}
                            canRemove={!!data.permissions?.can_remove_member}
                            canAdd={!!data.permissions?.can_add_member}
                            removingUid={removeMemberMu.variables}
                            existingParticipantIds={data.participants.map(
                              (participant) => participant.user_id,
                            )}
                            onAdd={(uids) => addMembersMu.mutate(uids)}
                            onRemove={(uid) => removeMemberMu.mutate(uid)}
                          />
                          <ParticipantReportsPanel
                            taskId={data.task_id}
                            resultId={data.result_id}
                            members={members}
                            myUid={myUid}
                            personalContent={personalResult?.content ?? ""}
                            personalCitations={personalResult?.citations ?? []}
                            showMyPendingSubmit={showMyPendingSubmit}
                            canEditPersonal={canEditPersonal && isCompleted}
                            submitting={submitPersonalMu.isPending}
                            onSubmitMine={submitMySummary}
                            onSaved={invalidate}
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {!isPersonalMode ? (
                    isFailed ? (
                      <SummaryFailedPanel
                        errorMessage={data.error_message}
                        taskNo={data.task_no}
                        createdAt={data.created_at}
                      />
                    ) : (
                      <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-4">
                        {isProcessing ? (
                          <SummaryProcessingPanel status={data.status} />
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
                    )
                  ) : null}
                  {isPersonalMode && isFailed ? (
                    <SummaryFailedPanel
                      errorMessage={data.error_message}
                      taskNo={data.task_no}
                      createdAt={data.created_at}
                    />
                  ) : null}
                </>
              )}
            </article>
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-8 py-3">
            <div className="mx-auto w-full max-w-[960px]">
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
