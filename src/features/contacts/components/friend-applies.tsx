import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Check, X } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import {
  friendAppliesQueryOptions,
  friendAppliesQueryKey,
} from "@/features/contacts/queries/friend-applies.query";
import { friendsQueryKey } from "@/features/contacts/queries/friends.query";
import {
  acceptFriendApply,
  clearFriendApplyReddot,
  deleteFriendApply,
} from "@/features/contacts/api/friend-applies.api";
import { FriendApplyStatus, type FriendApply } from "@/features/contacts/types/friend-apply.types";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";

/** 进入新好友 tab 时清空 reddot。旧项目同语义(NewFriend/vm.tsx didMount)。 */
function useClearReddotOnMount() {
  useEffect(() => {
    void clearFriendApplyReddot().catch(() => {
      // reddot 清失败不阻塞用户
    });
  }, []);
}

function ApplyRow({
  apply,
  onAccept,
  onDelete,
  busy,
}: {
  apply: FriendApply;
  onAccept: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const channel = new Channel(apply.to_uid, ChannelTypePerson);
  const accepted = apply.status === FriendApplyStatus.accepted;
  const refused = apply.status === FriendApplyStatus.refused;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover">
      <ChannelAvatar channel={channel} size={36} title={apply.to_name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">
          {apply.to_name || apply.to_uid}
        </span>
        {apply.remark ? (
          <span className="truncate text-xs text-text-tertiary">{apply.remark}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {accepted ? (
          <span className="text-xs text-online">已添加</span>
        ) : refused ? (
          <span className="text-xs text-text-tertiary">已拒绝</span>
        ) : (
          <>
            <Button type="primary" theme="solid" size="small" loading={busy} onClick={onAccept}>
              <Check size={14} />
              接受
            </Button>
            <Button type="tertiary" theme="borderless" size="small" iconOnly onClick={onDelete}>
              <X size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function FriendApplies() {
  useClearReddotOnMount();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(friendAppliesQueryOptions());

  const acceptMu = useMutation({
    mutationFn: (token: string) => acceptFriendApply(token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: friendAppliesQueryKey });
      void qc.invalidateQueries({ queryKey: friendsQueryKey });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "接受好友申请失败"),
  });
  const deleteMu = useMutation({
    mutationFn: (toUid: string) => deleteFriendApply(toUid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: friendAppliesQueryKey });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除好友申请失败"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载新好友申请…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">加载失败</div>
    );
  }
  const list = data ?? [];
  if (list.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        暂无新好友申请
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col divide-y divide-border-subtle overflow-y-auto">
      {list.map((apply) => (
        <ApplyRow
          key={`${apply.uid}-${apply.to_uid}`}
          apply={apply}
          busy={acceptMu.isPending && acceptMu.variables === apply.token}
          onAccept={() => apply.token && acceptMu.mutate(apply.token)}
          onDelete={() => deleteMu.mutate(apply.to_uid)}
        />
      ))}
    </div>
  );
}
