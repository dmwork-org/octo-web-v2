import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
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

const WORKER_STATUS_LABEL: Record<number, string> = {
  0: "待你提交",
  1: "已提交,等待汇总",
  2: "正在生成你的部分…",
  3: "你的总结已完成",
};

const PARTICIPANT_STATUS_LABEL: Record<number, string> = {
  [ParticipantStatus.PENDING]: "未确认",
  [ParticipantStatus.CONFIRMED]: "已确认",
  [ParticipantStatus.DECLINED]: "已拒绝",
};

/** ConfirmStep 让被邀者多选来源然后 POST /confirm */
function ConfirmStep({ taskId, onConfirmed }: { taskId: number; onConfirmed: () => void }) {
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
      toast.success("已确认参与");
      onConfirmed();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "确认失败"),
  });

  const declineMu = useMutation({
    mutationFn: () => declineParticipation(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: summaryDetailQueryKey(taskId) });
      toast.success("已拒绝");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "拒绝失败"),
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
      <p className="text-sm text-text-primary">
        你被邀请参与此次总结,选择你愿意贡献的会话来源后点击"确认"
      </p>
      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border-default bg-bg-base p-1">
        {candidates.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-tertiary">没有可贡献的会话</div>
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
                  {isGroup ? "群" : "私聊"}
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
          拒绝
        </Button>
        <Button
          type="primary"
          theme="solid"
          size="small"
          loading={confirmMu.isPending}
          disabled={selectedIds.size === 0}
          onClick={() => confirmMu.mutate()}
        >
          确认参与 ({selectedIds.size})
        </Button>
      </div>
    </div>
  );
}

/** MyResult 渲染当前用户的 personalResult(待提交 / 已提交 / 生成中 / 完成) */
function MyResult({ taskId }: { taskId: number }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(personalResultQueryOptions(taskId, true));

  const submitMu = useMutation({
    mutationFn: () => submitPersonalResult(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: personalResultQueryKey(taskId) });
      toast.success("已提交");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "提交失败"),
  });

  if (isLoading) return <p className="text-xs text-text-tertiary">加载你的部分…</p>;
  if (error || !data) return <p className="text-xs text-text-tertiary">暂无你的部分</p>;

  const statusLabel = WORKER_STATUS_LABEL[data.worker_status] ?? `状态 ${data.worker_status}`;
  const hasCitations = !!data.citations && data.citations.length > 0;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-text-primary">我的部分</h3>
        <span className="text-[11px] text-text-tertiary">
          {statusLabel} · {data.msg_count} 条消息
        </span>
      </div>
      {data.content ? (
        hasCitations ? (
          <CitationText content={data.content} citations={data.citations!} />
        ) : (
          <SummaryContent content={data.content} />
        )
      ) : (
        <p className="text-xs italic text-text-tertiary">暂无内容</p>
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
            提交我的部分
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** MembersStatus 创建人视角看所有 participants 提交进度 */
function MembersStatus({ taskId }: { taskId: number }) {
  const { data: members } = useQuery(membersQueryOptions(taskId, true));
  if (!members || members.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-bg-surface p-3">
      <h3 className="text-sm font-semibold text-text-primary">参与者状态</h3>
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
 * 个人模式总结面板(Wave 3c BY_PERSON 专用):
 *
 * - 被邀请且未确认 → ConfirmStep(选来源 / 拒绝 / 确认)
 * - 已确认 / 创建人 → MyResult(我的部分 + 提交按钮)
 * - 任何参与者都看 MembersStatus(所有人提交进度)
 * - 普通参与者 status 在 detail.participants 找出我;创建人本身可能不在
 *   participants 列表
 */
export function PersonalSection({ detail }: PersonalSectionProps) {
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
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="rounded-md border border-border-subtle bg-bg-surface p-3 text-sm text-text-tertiary">
          你已拒绝参与该总结
          {my.confirmed_at ? ` (${new Date(my.confirmed_at).toLocaleString("zh-CN")})` : ""}
        </p>
        <MembersStatus taskId={detail.task_id} />
      </div>
    );
  }

  // 已确认 / 创建人 → 我的部分 + 成员状态
  return (
    <div className="mt-3 flex flex-col gap-3">
      {!isCreator && my ? (
        <p className="text-xs text-text-tertiary">
          你的参与状态:{PARTICIPANT_STATUS_LABEL[my.status ?? 0] ?? "—"}
        </p>
      ) : null}
      {!isCreator ? <MyResult taskId={detail.task_id} /> : null}
      <MembersStatus taskId={detail.task_id} />
    </div>
  );
}
