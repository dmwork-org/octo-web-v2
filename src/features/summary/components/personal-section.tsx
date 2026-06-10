import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import {
  confirmParticipation,
  declineParticipation,
  submitPersonalResult,
} from "@/features/summary/api/summary.api";
import { CitationText } from "@/features/summary/components/citation-text";
import { SummaryContent } from "@/features/summary/components/summary-content";
import {
  membersQueryKey,
  membersQueryOptions,
  personalResultQueryKey,
  personalResultQueryOptions,
  summaryDetailQueryKey,
} from "@/features/summary/queries/summaries.query";
import { summaryBadgeQueryKey } from "@/features/summary/queries/summary-badge.query";
import {
  ParticipantStatus,
  SourceType,
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

const WORKER_STATUS_KEY: Record<number, string> = {
  0: "summary.personal.workerStatus0",
  1: "summary.personal.workerStatus1",
  2: "summary.personal.workerStatus2",
  3: "summary.personal.workerStatus3",
};

const PARTICIPANT_STATUS_KEY: Record<number, string> = {
  [ParticipantStatus.PENDING]: "summary.personal.participantStatusPending",
  [ParticipantStatus.CONFIRMED]: "summary.personal.participantStatusConfirmed",
  [ParticipantStatus.DECLINED]: "summary.personal.participantStatusDeclined",
};

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
      toast.success(t("summary.personal.confirmedToast"));
      onConfirmed();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.personal.confirmFailed")),
  });

  const declineMu = useMutation({
    mutationFn: () => declineParticipation(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
      void qc.invalidateQueries({ queryKey: summaryBadgeQueryKey });
      toast.success(t("summary.personal.declinedToast"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.personal.declineFailed")),
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
      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border-default bg-bg-base p-1">
        {candidates.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-tertiary">
            {tr("summary.personal.noContributable")}
          </div>
        ) : (
          candidates.map((c) => {
            const id = c.channel.channelID;
            const checked = selectedIds.has(id);
            const isGroup = c.channel.channelType === ChannelTypeGroup;
            const name = c.channelInfo?.title ?? id;
            return (
              <label
                key={`${c.channel.channelType}-${id}`}
                className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover ${
                  checked ? "bg-brand-tint" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(id)}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                  {isGroup ? tr("summary.personal.tagGroup") : tr("summary.personal.tagDirect")}
                </span>
              </label>
            );
          })
        )}
      </div>
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
function MyResult({ taskId }: { taskId: number }) {
  const tr = useT();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(personalResultQueryOptions(taskId, true));

  const submitMu = useMutation({
    mutationFn: () => submitPersonalResult(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: personalResultQueryKey(taskId) });
      toast.success(t("summary.personal.submittedToast"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.personal.submitFailed")),
  });

  if (isLoading)
    return <p className="text-xs text-text-tertiary">{tr("summary.personal.loadMine")}</p>;
  if (error || !data)
    return <p className="text-xs text-text-tertiary">{tr("summary.personal.noMine")}</p>;

  const statusKey = WORKER_STATUS_KEY[data.worker_status];
  const statusLabel = statusKey
    ? tr(statusKey)
    : tr("summary.personal.workerStatusFallback", { values: { status: data.worker_status } });
  const hasCitations = !!data.citations && data.citations.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">
          {tr("summary.personal.mySection")}
        </h3>
        <span className="text-[11px] text-text-tertiary">
          {statusLabel} · {tr("summary.personal.msgCount", { values: { count: data.msg_count } })}
        </span>
      </div>
      {data.content ? (
        hasCitations ? (
          <CitationText content={data.content} citations={data.citations!} />
        ) : (
          <SummaryContent content={data.content} />
        )
      ) : (
        <p className="text-xs italic text-text-tertiary">{tr("summary.personal.emptyContent")}</p>
      )}
      {data.worker_status === 0 && data.content ? (
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

/** MembersStatus 创建人视角看所有 participants 提交进度 */
function MembersStatus({ taskId }: { taskId: number }) {
  const tr = useT();
  const { data: members } = useQuery(membersQueryOptions(taskId, true));
  if (!members || members.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface p-3">
      <h3 className="text-sm font-semibold text-text-primary">
        {tr("summary.personal.statusTitle")}
      </h3>
      <ul className="flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2 text-xs">
            <ChannelAvatar
              channel={new Channel(m.user_id, ChannelTypePerson)}
              size={20}
              title={m.user_name || m.user_id}
            />
            <span className="min-w-0 flex-1 truncate text-text-primary">
              {m.user_name || m.user_id}
            </span>
            <span className="shrink-0 text-text-tertiary">{m.status}</span>
            {m.submitted_at ? (
              <span className="shrink-0 text-text-tertiary">
                {new Date(m.submitted_at).getMonth() + 1}/{new Date(m.submitted_at).getDate()}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 个人模式总结面板(Wave 3c BY_PERSON 专用)。
 */
export function PersonalSection({ detail }: PersonalSectionProps) {
  const tr = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const my = findMyParticipant(detail, myUid);
  const isCreator = !my; // 旧服务端约定:创建人不入 participants

  // 当前用户被邀且未确认
  if (my?.status === ParticipantStatus.PENDING) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <ConfirmStep
          taskId={detail.task_id}
          onConfirmed={() =>
            void qc.invalidateQueries({ queryKey: membersQueryKey(detail.task_id) })
          }
        />
        <MembersStatus taskId={detail.task_id} />
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
        <MembersStatus taskId={detail.task_id} />
      </div>
    );
  }

  // 已确认 / 创建人 → 我的部分 + 成员状态
  const statusKey = PARTICIPANT_STATUS_KEY[my?.status ?? 0];
  const statusLabel = statusKey ? tr(statusKey) : tr("summary.personal.myStatusFallback");
  return (
    <div className="mt-3 flex flex-col gap-3">
      {!isCreator && my ? (
        <p className="text-xs text-text-tertiary">
          {tr("summary.personal.myStatusLine", { values: { status: statusLabel } })}
        </p>
      ) : null}
      {!isCreator ? <MyResult taskId={detail.task_id} /> : null}
      <MembersStatus taskId={detail.task_id} />
    </div>
  );
}
