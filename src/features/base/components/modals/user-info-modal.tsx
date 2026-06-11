import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Subscriber } from "wukongimjssdk";
import { AlertCircle, MessageCircle } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { RealnameVerifiedBadge } from "@/features/base/components/badges/realname-verified-badge";
import { displayName, isRealnameVerified } from "@/features/base/lib/display-name";
import { FriendApplyModal } from "@/features/base/components/modals/friend-apply-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { deleteFriend, setUserRemark } from "@/features/contacts/api/friends.api";
import { blacklistAdd, blacklistRemove } from "@/features/base/api/endpoints/blacklist.api";
// section-form 共享原语
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";

interface UserInfoModalProps {
  uid: string | null;
  /** 群内查看用户信息时传入,用于展示进群方式并让详情接口返回群上下文。 */
  groupNo?: string;
  /** 搜索结果带来的 vercode(陌生人申请好友需要) */
  vercode?: string;
  onClose: () => void;
}

const APP_NAME = "Octo";
const REL_FRIEND = 1;
const REL_BLACKLIST = 2;

interface GroupJoinOrgData {
  created_at?: unknown;
  invite_name?: unknown;
  invite_uid?: unknown;
  inviter_name?: unknown;
}

function findGroupSubscriber(subscribers: Subscriber[], uid: string | null): Subscriber | null {
  if (!uid) return null;
  return subscribers.find((s) => s.uid === uid) ?? null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }
  return "";
}

/**
 * 用户名片弹窗(对应旧 dmworkbase Components/UserInfo)。
 *
 * 浮动元素壳层统一规范 Phase C — 走 BaseDialog,内嵌 FriendApply / Confirm 自动嵌套 z-index。
 *
 * Sections 4 段 + 底部按钮 5 分支(F-1a 已对齐 UserInfo.getBottomPanel)。
 */
export function UserInfoModal({ uid, groupNo, vercode, onClose }: UserInfoModalProps) {
  const t = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const myName = useStore(authStore, (s) => s.user?.name ?? s.user?.username ?? "");
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data, isLoading } = useQuery(userDetailQueryOptions(uid, groupNo));
  const groupChannel = useMemo(
    () => new Channel(groupNo ?? "", ChannelTypeGroup),
    [groupNo],
  );
  const groupSubscribers = useGroupSubscribers(groupChannel, !!groupNo && !!uid);
  const [friendApplyOpen, setFriendApplyOpen] = useState(false);
  const [remarkEditing, setRemarkEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    action: "deleteFriend" | "blacklistAdd" | "blacklistRemove";
    content: string;
    title?: string;
  }>(null);

  const invalidate = () => {
    if (uid) void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid, groupNo) });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  const remarkMu = useMutation({
    mutationFn: (remark: string) => setUserRemark(uid!, remark),
    onSuccess: () => {
      invalidate();
      // 对齐上游 2b1c78c3(#326):备注改完后立即刷新 SDK channelInfo cache,
      // 让群消息的 senderDisplay(读 personChannelInfo.title)即时反映新备注。
      // useSenderInfoLive 已挂 channelInfoListener,fetch 拿到新 cache 后会
      // 触发 force re-render。
      if (uid) {
        void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
      }
      toast.success(t("base.userInfo.saved"));
      setRemarkEditing(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.userInfo.setRemarkFailed")),
  });

  const deleteFriendMu = useMutation({
    mutationFn: () => deleteFriend(uid!),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.userInfo.friendDeleted"));
      setConfirm(null);
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.userInfo.deleteFriendFailed")),
  });

  const blacklistAddMu = useMutation({
    mutationFn: () => blacklistAdd(uid!),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.userInfo.blacklistAdded"));
      setConfirm(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.userInfo.blacklistAddFailed")),
  });

  const blacklistRemoveMu = useMutation({
    mutationFn: () => blacklistRemove(uid!),
    onSuccess: () => {
      invalidate();
      toast.success(t("base.userInfo.blacklistRemoved"));
      setConfirm(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("base.userInfo.blacklistRemoveFailed")),
  });

  const channel = uid ? new Channel(uid, ChannelTypePerson) : null;
  const display =
    displayName({
      name: data?.name,
      remark: data?.remark,
      real_name: data?.real_name,
      realname_verified: data?.realname_verified,
    }) ||
    uid ||
    "";

  const isSelf = uid === myUid;
  const isBot = data?.robot === 1;
  const isFriend = data?.follow === REL_FRIEND;
  const isBlacklisted = data?.status === REL_BLACKLIST;
  const isExternal =
    !!data?.home_space_id && !!currentSpaceId && data.home_space_id !== currentSpaceId;
  const hasVercode = !!(vercode || data?.vercode);
  const showRealname = isRealnameVerified({
    real_name: data?.real_name,
    realname_verified: data?.realname_verified,
  });
  const hasRemark = !!(data?.remark && data.remark !== "");
  const groupSubscriber = findGroupSubscriber(groupSubscribers, uid);

  const groupJoinMethod = (() => {
    if (!groupSubscriber) return "";
    const org = (groupSubscriber.orgData ?? {}) as GroupJoinOrgData;
    const date = joinDate(org.created_at);
    if (!date) return "";
    const inviteName =
      textValue(org.invite_name) ||
      textValue(org.inviter_name) ||
      (() => {
        const inviteUid = textValue(org.invite_uid);
        if (!inviteUid) return "";
        const inviteInfo = WKSDK.shared().channelManager.getChannelInfo(
          new Channel(inviteUid, ChannelTypePerson),
        );
        return inviteInfo?.title ?? "";
      })();
    if (inviteName) {
      return `${date}${t("base.userInfo.invitedBy", { values: { name: inviteName } })}`;
    }
    return `${date}${t("base.userInfo.joinedGroup")}`;
  })();

  const handleMessage = () => {
    if (!channel) return;
    chatSelectedActions.select(channel);
    onClose();
  };

  // 底部按钮 5 分支
  const renderBottom = () => {
    if (isSelf) return null;
    if (isExternal) {
      return (
        <div className="flex items-center justify-center px-6 py-3 text-xs text-text-tertiary">
          {t("base.userInfo.onlyInGroup")}
        </div>
      );
    }
    if (currentSpaceId && (!isBot || isFriend)) {
      return (
        <Button type="primary" theme="solid" onClick={handleMessage}>
          <MessageCircle size={14} />
          {t("base.userInfo.sendMessage")}
        </Button>
      );
    }
    if (isFriend) {
      return (
        <Button type="primary" theme="solid" onClick={handleMessage}>
          <MessageCircle size={14} />
          {t("base.userInfo.sendMessage")}
        </Button>
      );
    }
    if (isBot) {
      return (
        <Button type="primary" theme="solid" onClick={() => setFriendApplyOpen(true)}>
          {t("base.userInfo.addFriend")}
        </Button>
      );
    }
    if (!hasVercode) return null;
    return (
      <Button type="secondary" theme="light" onClick={() => setFriendApplyOpen(true)}>
        {t("base.userInfo.addFriend")}
      </Button>
    );
  };

  const applyDefaultMessage = isBot
    ? t("base.userInfo.applyToBotMessage", { values: { name: display } })
    : t("base.userInfo.applyFromMe", { values: { name: myName } });

  const renderSections = () => {
    if (isSelf) return null;
    const sections: React.ReactNode[] = [];

    sections.push(
      <SectionGroup key="remark">
        <InlineEditRow
          title={t("base.userInfo.setRemark")}
          value={data?.remark ?? ""}
          placeholder={t("base.common.notSet")}
          canEdit
          maxLength={20}
          pending={remarkMu.isPending}
          editing={remarkEditing}
          onEnterEdit={() => setRemarkEditing(true)}
          onCancel={() => setRemarkEditing(false)}
          onSave={(v) => remarkMu.mutate(v)}
        />
      </SectionGroup>,
    );

    if (isExternal) {
      sections.push(
        <SectionGroup key="others">
          {isFriend ? (
            <NavRow
              title={t("base.userInfo.releaseFriend")}
              danger
              onClick={() =>
                setConfirm({
                  action: "deleteFriend",
                  content: t("base.userInfo.deleteFriendContent", { values: { name: display } }),
                })
              }
            />
          ) : null}
          {isBlacklisted ? (
            <NavRow
              title={t("base.userInfo.blacklistRemoveAction")}
              onClick={() =>
                setConfirm({
                  action: "blacklistRemove",
                  content: t("base.userInfo.blacklistRemoveContent"),
                })
              }
            />
          ) : (
            <NavRow
              title={t("base.userInfo.blacklistAddAction")}
              danger
              onClick={() =>
                setConfirm({
                  action: "blacklistAdd",
                  content: t("base.userInfo.blacklistAddContent"),
                })
              }
            />
          )}
        </SectionGroup>,
      );
    }

    if (isExternal && data?.source_space_name) {
      sections.push(
        <SectionGroup key="source">
          <NavRow title={t("base.userInfo.source")} subTitle={data.source_space_name} />
        </SectionGroup>,
      );
    } else if (!isExternal && isFriend && data?.source_desc) {
      sections.push(
        <SectionGroup key="source">
          <NavRow title={t("base.userInfo.source")} subTitle={data.source_desc} />
        </SectionGroup>,
      );
    }

    if (groupJoinMethod) {
      sections.push(
        <SectionGroup key="group-join-method">
          <NavRow title={t("base.userInfo.joinMethod")} subTitle={groupJoinMethod} />
        </SectionGroup>,
      );
    }

    if (isBlacklisted) {
      sections.push(
        <div
          key="blacklist-tip"
          className="mx-4 mb-2 flex items-center justify-center gap-1 rounded-md bg-error/10 px-4 py-2 text-[12px] text-error"
        >
          <AlertCircle size={12} />
          {t("base.userInfo.blacklistedTip")}
        </div>,
      );
    }

    return sections;
  };

  const onConfirmOk = () => {
    if (!confirm) return;
    if (confirm.action === "deleteFriend") deleteFriendMu.mutate();
    else if (confirm.action === "blacklistAdd") blacklistAddMu.mutate();
    else if (confirm.action === "blacklistRemove") blacklistRemoveMu.mutate();
  };

  const confirmLoading =
    deleteFriendMu.isPending || blacklistAddMu.isPending || blacklistRemoveMu.isPending;

  return (
    <>
      <BaseDialog
        open={!!uid}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        size="sm"
        description={
          display
            ? t("base.userInfo.cardOf", { values: { name: display } })
            : t("base.userInfo.cardFallback")
        }
      >
        {isLoading || !channel ? (
          <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
            {t("base.common.loading")}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-start gap-4 px-6 pt-2 pb-4">
              <ChannelAvatar channel={channel} size={54} title={display} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="truncate text-base font-semibold text-text-primary">
                    {display}
                  </span>
                  {isBot ? <AiBadge size="small" /> : null}
                  {showRealname ? <RealnameVerifiedBadge variant="full" /> : null}
                </div>
                <ul className="flex flex-col gap-0.5 text-[12px] text-text-tertiary">
                  {hasRemark ? (
                    <li>
                      {t("base.userInfo.nicknameLabel")}: {data?.name ?? "—"}
                    </li>
                  ) : null}
                  {data?.short_no ? (
                    <li>
                      {APP_NAME}号: {data.short_no}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto border-t border-border-subtle py-2">
              {renderSections()}
            </div>

            <div className="flex min-h-[60px] shrink-0 items-center justify-center border-t border-border-subtle px-6 py-3">
              {renderBottom()}
            </div>
          </>
        )}
      </BaseDialog>

      {uid ? (
        <FriendApplyModal
          open={friendApplyOpen}
          toUid={uid}
          vercode={vercode || data?.vercode}
          defaultMessage={applyDefaultMessage}
          title={isBot ? t("base.userInfo.applyToBot") : t("base.userInfo.applyToPerson")}
          onClose={() => setFriendApplyOpen(false)}
          onSuccess={() => {
            setFriendApplyOpen(false);
            onClose();
          }}
        />
      ) : null}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        content={confirm?.content ?? ""}
        okDanger={confirm?.action !== "blacklistRemove"}
        okLoading={confirmLoading}
        onOk={onConfirmOk}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
