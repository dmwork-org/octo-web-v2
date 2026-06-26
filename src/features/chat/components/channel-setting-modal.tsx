import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Subscriber,
} from "wukongimjssdk";
import { Minus, Plus, QrCode } from "lucide-react";
import { message } from "@/components/ui/message";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ChannelMembersModal } from "@/features/chat/components/channel-members-modal";
import { AddMembersModal } from "@/features/chat/components/add-members-modal";
import { GroupAvatarModal } from "@/features/chat/components/group-avatar-modal";
import { GroupQrcodeModal } from "@/features/chat/components/group-qrcode-modal";
import { GroupMdModal } from "@/features/chat/components/group-md-modal";
import { GroupManagementModal } from "@/features/chat/components/group-management-modal";
import { IncomingWebhookPanel } from "@/features/chat/components/incoming-webhook-panel";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { UserInfoModal } from "@/features/base/components/modals/user-info-modal";
import { RealnameVerifiedBadge } from "@/features/base/components/badges/realname-verified-badge";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { isVerifiedMember } from "@/features/chat/lib/member-realname";
import {
  clearChannelMessages,
  deleteConversation,
} from "@/features/base/api/endpoints/conversation.api";
import {
  setChannelMute,
  setChannelRemark,
  setChannelSave,
  setChannelTop,
} from "@/features/base/api/endpoints/channel-setting.api";
import {
  archiveThread,
  exitGroup,
  leaveThread,
  deleteThread,
  unarchiveThread,
  updateGroup,
  updateGroupMember,
  updateThread,
} from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { canManageThread } from "@/features/chat/lib/thread-permission";
import { refreshThreadChannelInfoCache } from "@/features/chat/lib/thread-archive-actions";
import { THREAD_STATUS_ARCHIVED } from "@/features/chat/lib/thread-status";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { conversationsQueryKey } from "@/features/chat/queries/conversations.query";
import { removeThreadConversation } from "@/features/chat/lib/remove-thread-conversation";
// section-form 共享原语
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { ToggleRow } from "@/features/base/components/section-form/toggle-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface ChannelSettingModalProps {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;
const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

type Subpage = "avatar" | "qrcode" | "md" | "manage" | "webhook";

/**
 * 顶部成员头像 grid — 对齐老仓 `Components/Subscribers/vm.ts:13-73`:
 *   - 最多 20 格(`MAX_GRID`)
 *   - canAdd 占 1 格 + canManage(remove)占 1 格 → 实际成员位 = 20 - addBtn - removeBtn
 *   - 超过 showNum 时 grid 截断,下方显示"查看更多"链接进入完整成员列表
 *
 * `shrink-0` 防 flex column 父容器空间紧时被压缩(对齐 MR #23 SectionGroup 同源修复)。
 */
const MAX_GRID = 20;

function SubscribersGrid({
  subscribers,
  canAdd,
  canManage,
  onAdd,
  onKickMode,
  onMore,
  onAvatarClick,
}: {
  subscribers: Subscriber[];
  canAdd: boolean;
  canManage: boolean;
  onAdd: () => void;
  onKickMode: () => void;
  onMore: () => void;
  onAvatarClick: (uid: string) => void;
}) {
  const tt = useT();
  const showNum = MAX_GRID - (canAdd ? 1 : 0) - (canManage ? 1 : 0);
  const visible = subscribers.length > showNum ? subscribers.slice(0, showNum) : subscribers;
  const hasMore = subscribers.length > showNum;
  return (
    <section className="mx-4 mb-2 shrink-0 rounded-md border border-border-subtle bg-bg-base px-2 py-3">
      <div className="grid grid-cols-5 gap-y-3">
        {visible.map((m) => (
          <SubscriberCell key={m.uid} subscriber={m} onAvatarClick={onAvatarClick} />
        ))}
        {canAdd ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label={tt("channelSetting.addMember")}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-tertiary transition-colors hover:bg-bg-hover">
              <Plus size={20} />
            </span>
            <span className="block text-[11px] text-text-tertiary">&nbsp;</span>
          </button>
        ) : null}
        {canManage ? (
          <button
            type="button"
            onClick={onKickMode}
            aria-label={tt("channelSetting.removeMember")}
            className="flex flex-col items-center gap-1.5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-tertiary transition-colors hover:bg-bg-hover">
              <Minus size={20} />
            </span>
            <span className="block text-[11px] text-text-tertiary">&nbsp;</span>
          </button>
        ) : null}
      </div>
      {hasMore ? (
        <button
          type="button"
          onClick={onMore}
          className="mt-3 block w-full cursor-pointer rounded-sm py-1.5 text-center text-[12px] text-brand transition-colors hover:bg-bg-hover"
        >
          {tt("channelSetting.viewMoreMembers", { values: { count: subscribers.length } })}
        </button>
      ) : null}
    </section>
  );
}

function SubscriberCell({
  subscriber,
  onAvatarClick,
}: {
  subscriber: Subscriber;
  onAvatarClick: (uid: string) => void;
}) {
  const tt = useT();
  const display = subscriber.remark || subscriber.name || subscriber.uid;
  const ch = new Channel(subscriber.uid, ChannelTypePerson);
  const isVerified = isVerifiedMember(subscriber);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => onAvatarClick(subscriber.uid)}
        aria-label={tt("channelSetting.viewMemberInfo")}
        className="relative rounded-full cursor-pointer hover:opacity-80 transition-opacity"
      >
        <ChannelAvatar channel={ch} size={48} title={display} />
        {subscriber.role === ROLE_OWNER ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-warning px-1 py-px text-[9px] leading-none font-semibold whitespace-nowrap text-white">
            {tt("channelSetting.owner")}
          </span>
        ) : subscriber.role === ROLE_MANAGER ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-brand px-1 py-px text-[9px] leading-none font-semibold whitespace-nowrap text-white">
            {tt("channelSetting.managerBadge")}
          </span>
        ) : null}
      </button>
      <span className="flex w-full max-w-16 items-center justify-center text-[11px] leading-[14px] text-text-secondary">
        <span className="min-w-0 truncate">{display}</span>
        {isVerified ? <RealnameVerifiedBadge variant="icon" className="ml-[3px]" /> : null}
      </span>
    </div>
  );
}

function updateCachedSubscriberRemark(channel: Channel, uid: string, remark: string): void {
  const cm = WKSDK.shared().channelManager;
  const subscriber = cm.getSubscribes(channel)?.find((s) => s.uid === uid);
  if (!subscriber) return;
  subscriber.remark = remark;
  const orgData = (subscriber.orgData ?? {}) as Record<string, unknown>;
  orgData.remark = remark;
  subscriber.orgData = orgData;
  cm.notifySubscribeChangeListeners(channel);
}

/**
 * 频道设置抽屉(对应旧 dmworkbase ChannelSetting,1:1 字段对齐)。
 *
 * **子区设置归档入口(issue #53)**:
 * 老仓子区"归档/取消归档"挂在 ThreadPanel detail header 三点菜单。本仓把子区
 * 设置统一塞进 ChannelSettingModal,所以归档入口也归到这里 — 在 danger 区前
 * 单立一个 SectionGroup,canManageThread(creator / 父群 owner / manager)才显示。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kickListOpen, setKickListOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [subpage, setSubpage] = useState<Subpage | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [ownerLeaveBlocked, setOwnerLeaveBlocked] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const title = channelInfo?.title || channel.channelID;
  const isGroup = channel.channelType === ChannelTypeGroup;
  const isThread = channel.channelType === CHANNEL_TYPE_THREAD;
  const isPerson = channel.channelType === ChannelTypePerson;
  const isMuted = !!channelInfo?.mute;
  const isTop = !!channelInfo?.top;
  const orgData = channelInfo?.orgData as
    | {
        member_count?: number;
        notice?: string;
        remark?: string;
        save?: number;
        has_group_md?: number | boolean;
        group_md_version?: number;
        invite?: number;
      }
    | undefined;
  const isSaved = orgData?.save === 1;
  const inviteVerifyOn = orgData?.invite === 1;
  const notice = orgData?.notice ?? "";
  const remark = orgData?.remark ?? "";
  const hasGroupMd = !!orgData?.has_group_md;
  const groupMdVersion = orgData?.group_md_version ?? 0;

  const subscribers = useGroupSubscribers(channel, open && (isGroup || isThread));
  const me = subscribers.find((s) => s.uid === myUid);
  const myRole = me?.role ?? 0;
  const iAmOwner = myRole === ROLE_OWNER;
  const iAmOwnerOrManager = myRole === ROLE_OWNER || myRole === ROLE_MANAGER;
  const myNickname = me?.remark || me?.name || "";

  const memberCountFromSubs = subscribers.length;
  const memberCount = memberCountFromSubs > 0 ? memberCountFromSubs : (orgData?.member_count ?? 0);
  const headerCount = isGroup ? memberCount : undefined;

  const threadParsed = isThread ? parseThreadChannelId(channel.channelID) : null;
  const threadParentChannel = threadParsed
    ? new Channel(threadParsed.groupNo, ChannelTypeGroup)
    : null;
  const threadParentName =
    (threadParentChannel
      ? WKSDK.shared().channelManager.getChannelInfo(threadParentChannel)?.title
      : "") ||
    threadParsed?.groupNo ||
    "";
  const threadCreatorUid = (
    channelInfo?.orgData as { thread?: { creator_uid?: string } } | undefined
  )?.thread?.creator_uid;
  const canEditThreadName = isThread && (threadCreatorUid === myUid || iAmOwnerOrManager);
  // 子区 creator 不能"离开"(后端拒绝),只能"解散"— 对齐老仓 UI 分流(creator 看
  // "解散子区" → DELETE,普通成员看"离开子区" → POST leave)
  const isThreadCreator = isThread && !!threadCreatorUid && threadCreatorUid === myUid;
  const threadStatus = (channelInfo?.orgData as { thread?: { status?: number } } | undefined)
    ?.thread?.status;
  const isThreadArchived = threadStatus === THREAD_STATUS_ARCHIVED;
  // 子区归档权限:creator / 父群 owner / 父群 manager(对齐 thread-permission.ts
  // 跟 thread-list-panel inline 按钮共用同款判定,避免一处可见一处不可见)
  const canArchiveThisThread =
    isThread &&
    canManageThread(
      threadCreatorUid ? { creator_uid: threadCreatorUid } : null,
      threadParsed?.groupNo ?? "",
      myUid,
    );
  const hasThreadMd = !!(channelInfo?.orgData as { has_thread_md?: boolean } | undefined)
    ?.has_thread_md;
  const threadMdVersion =
    (channelInfo?.orgData as { thread_md_version?: number } | undefined)?.thread_md_version ?? 0;

  const refreshChannelInfo = () => {
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  };

  const topMu = useMutation({
    mutationFn: (top: boolean) => setChannelTop(channel, top),
    onSuccess: () => {
      refreshChannelInfo();
      const currentSpaceId = spaceStore.state.spaceId;
      if (currentSpaceId) {
        void qc.invalidateQueries({ queryKey: conversationsQueryKey(currentSpaceId) });
      }
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(currentSpaceId) });
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const muteMu = useMutation({
    mutationFn: (mute: boolean) => setChannelMute(channel, mute),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const saveMu = useMutation({
    mutationFn: (save: boolean) => setChannelSave(channel, save),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const renameMu = useMutation({
    mutationFn: async (name: string) => {
      if (isThread) {
        const p = parseThreadChannelId(channel.channelID);
        if (!p) throw new Error(t("channelSetting.error.threadParseFailed"));
        await updateThread(p.groupNo, p.shortId, { name });
      } else {
        await updateGroup(channel.channelID, { name });
      }
    },
    onSuccess: async () => {
      WKSDK.shared().channelManager.deleteChannelInfo(channel);
      await WKSDK.shared().channelManager.fetchChannelInfo(channel);
      setEditing(null);
      message.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const noticeMu = useMutation({
    mutationFn: (next: string) => updateGroup(channel.channelID, { notice: next }),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      message.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const remarkMu = useMutation({
    mutationFn: (next: string) => setChannelRemark(channel, next),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      message.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const myNickMu = useMutation({
    mutationFn: (next: string) => updateGroupMember(channel.channelID, myUid, { remark: next }),
    onSuccess: (_data, next) => {
      updateCachedSubscriberRemark(channel, myUid, next);
      void WKSDK.shared().channelManager.syncSubscribes(channel);
      setEditing(null);
      message.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const clearMu = useMutation({
    mutationFn: () => {
      const conv = WKSDK.shared().conversationManager.findConversation(channel);
      return clearChannelMessages({
        channelId: channel.channelID,
        channelType: channel.channelType,
        messageSeq: conv?.lastMessage?.messageSeq ?? 0,
      });
    },
    onSuccess: () => {
      qc.setQueryData(["chat", "messages", channel.channelType, channel.channelID], {
        pages: [[]],
        pageParams: [0],
      });
      message.success(t("channelSetting.toast.cleared"));
      setConfirmClear(false);
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.clearFailed")),
  });

  const closeMu = useMutation({
    mutationFn: async () => {
      if (isThread) {
        const p = parseThreadChannelId(channel.channelID);
        if (!p) throw new Error(t("channelSetting.error.threadParseFailed"));
        // creator 走 DELETE /groups/{groupNo}/threads/{shortId}(解散),
        // 非 creator 走 POST /threads/{shortId}/leave(离开)— 对齐老仓
        if (isThreadCreator) {
          await deleteThread(p.groupNo, p.shortId);
        } else {
          await leaveThread(p.shortId);
        }
      } else {
        if (isGroup) {
          await exitGroup(channel.channelID);
          await deleteConversation({
            channelId: channel.channelID,
            channelType: channel.channelType,
          }).catch((err) => {
            console.warn("[ChannelSetting] delete conversation after leaving failed", err);
          });
        } else {
          await deleteConversation({
            channelId: channel.channelID,
            channelType: channel.channelType,
          });
        }
      }
    },
    onSuccess: () => {
      if (isThread) {
        removeThreadConversation(channel, qc, spaceId, {
          groupNo: threadParsed?.groupNo,
          shortId: threadParsed?.shortId,
        });
        void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      } else {
        WKSDK.shared().conversationManager.removeConversation(channel);
        void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      }
      if (
        chatSelectedStore.state.channel?.channelID === channel.channelID &&
        chatSelectedStore.state.channel.channelType === channel.channelType
      ) {
        chatSelectedActions.clear();
      }
      message.success(
        isGroup
          ? t("channelSetting.toast.leftGroup")
          : isThread
            ? isThreadCreator
              ? t("channelSetting.toast.dissolvedThread")
              : t("channelSetting.toast.leftThread")
            : t("channelSetting.toast.closedChat"),
      );
      setConfirmClose(false);
      onClose();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  /**
   * 归档 / 取消归档子区 — 按 isThreadArchived 推导动作(issue #53)。
   *
   * 成功后:
   * - 强制重拉 channelInfo(让 orgData.thread.status 同步,下次开 modal 显新文案)
   * - invalidate thread-list query(让 thread panel 列表分组刷新)
   * - invalidate sidebarFollow(让侧边栏关注列表跟着隐/显已归档子区)
   * 跟 thread-list-panel inline 按钮的 invalidate 范围一致。
   */
  const archiveMu = useMutation({
    mutationFn: async () => {
      const p = parseThreadChannelId(channel.channelID);
      if (!p) throw new Error(t("channelSetting.error.threadParseFailed"));
      if (isThreadArchived) {
        await unarchiveThread(p.groupNo, p.shortId);
      } else {
        await archiveThread(p.groupNo, p.shortId);
      }
    },
    onSuccess: async () => {
      // 清 SDK channelInfo 缓存 + invalidate(对齐 thread-list-panel 两处归档入口,
      // 用同款 helper 防止逻辑漂移;issue #72 三入口必须共用)
      if (threadParsed) {
        refreshThreadChannelInfoCache(threadParsed.groupNo, threadParsed.shortId);
        void qc.invalidateQueries({ queryKey: ["chat", "thread-list", threadParsed.groupNo] });
      }
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      message.success(
        isThreadArchived
          ? t("threadPanelLocal.unarchiveSuccess")
          : t("threadPanelLocal.archiveSuccess"),
      );
      setConfirmArchive(false);
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const dangerCloseTitle = isGroup
    ? tt("channelSetting.dangerCloseGroup")
    : isThread
      ? isThreadCreator
        ? tt("channelSetting.dangerDissolveThread")
        : tt("channelSetting.dangerCloseThread")
      : tt("channelSetting.dangerCloseChat");
  const dangerCloseConfirm = isGroup
    ? tt("channelSetting.confirmLeaveGroup")
    : isThread
      ? isThreadCreator
        ? tt("channelSetting.confirmDissolveThread")
        : tt("channelSetting.confirmLeaveThread")
      : tt("channelSetting.confirmCloseChat");

  return (
    <>
      <BaseDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side="right"
        size="md"
        contentClassName="py-2"
        title={
          typeof headerCount === "number"
            ? tt("channelSetting.titleWithCount", { values: { count: headerCount } })
            : tt("channelSetting.title")
        }
      >
        {isGroup ? (
          <SubscribersGrid
            subscribers={subscribers}
            canAdd
            canManage={iAmOwnerOrManager}
            onAdd={() => setAddOpen(true)}
            onKickMode={() => setKickListOpen(true)}
            onMore={() => setKickListOpen(true)}
            onAvatarClick={setSelectedMemberId}
          />
        ) : null}

        {isPerson ? (
          <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-3">
            <ChannelAvatar channel={channel} size={56} title={title} />
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          </div>
        ) : null}

        {isPerson ? (
          <SectionGroup>
            <NavRow title={tt("channelSetting.addMember")} onClick={() => setAddOpen(true)} />
          </SectionGroup>
        ) : null}

        {isGroup ? (
          <SectionGroup>
            <InlineEditRow
              title={tt("channelSetting.groupName")}
              value={title}
              placeholder={tt("channelSetting.notSet")}
              canEdit={iAmOwnerOrManager}
              cantEditMessage={tt("channelSetting.cantEditGroupName")}
              maxLength={20}
              pending={renameMu.isPending}
              editing={editing === "name"}
              onEnterEdit={() => setEditing("name")}
              onCancel={() => setEditing(null)}
              onSave={(v) => renameMu.mutate(v)}
            />
            <NavRow
              title={tt("channelSetting.groupAvatar")}
              right={<ChannelAvatar channel={channel} size={24} title={title} />}
              onClick={() => setSubpage("avatar")}
            />
            <NavRow
              title={tt("channelSetting.groupQrcode")}
              right={<QrCode size={16} className="text-text-tertiary" />}
              onClick={() => setSubpage("qrcode")}
            />
            <InlineEditRow
              title={tt("channelSetting.groupNotice")}
              value={notice}
              placeholder={tt("channelSetting.notSet")}
              canEdit={iAmOwnerOrManager}
              cantEditMessage={tt("channelSetting.cantEditGroupNotice")}
              multiline
              maxLength={400}
              pending={noticeMu.isPending}
              editing={editing === "notice"}
              onEnterEdit={() => setEditing("notice")}
              onCancel={() => setEditing(null)}
              onSave={(v) => noticeMu.mutate(v)}
            />
            <NavRow
              title="GROUP.md"
              subTitle={
                hasGroupMd
                  ? tt("channelSetting.configuredV", { values: { v: groupMdVersion } })
                  : tt("channelSetting.notConfigured")
              }
              onClick={() => setSubpage("md")}
            />
            {iAmOwnerOrManager ? (
              <NavRow
                title={tt("channelSetting.groupManagement")}
                onClick={() => setSubpage("manage")}
              />
            ) : null}
            <NavRow
              title={tt("module.channelSettings.incomingWebhook")}
              onClick={() => setSubpage("webhook")}
            />
            <InlineEditRow
              title={tt("channelSetting.remark")}
              value={remark}
              placeholder={tt("channelSetting.remarkPlaceholder")}
              canEdit
              maxLength={15}
              pending={remarkMu.isPending}
              editing={editing === "remark"}
              onEnterEdit={() => setEditing("remark")}
              onCancel={() => setEditing(null)}
              onSave={(v) => remarkMu.mutate(v)}
            />
          </SectionGroup>
        ) : null}

        {isThread ? (
          <SectionGroup>
            <InlineEditRow
              title={tt("channelSetting.threadName")}
              value={title}
              placeholder={tt("channelSetting.notSet")}
              canEdit={canEditThreadName}
              cantEditMessage={tt("channelSetting.cantEditThreadName")}
              maxLength={50}
              pending={renameMu.isPending}
              editing={editing === "name"}
              onEnterEdit={() => setEditing("name")}
              onCancel={() => setEditing(null)}
              onSave={(v) => renameMu.mutate(v)}
            />
            <NavRow
              title={tt("channelSetting.threadStatus")}
              right={
                isThreadArchived ? (
                  <span className="rounded-sm bg-[rgba(28,28,35,0.06)] px-1.5 py-0.5 text-[11px] text-text-tertiary">
                    {tt("threadPanelLocal.archived")}
                  </span>
                ) : (
                  <span className="rounded-sm bg-success/10 px-1.5 py-0.5 text-[11px] text-success">
                    {tt("channelSetting.threadStatusActive")}
                  </span>
                )
              }
            />
            <NavRow
              title={tt("channelSetting.threadParent")}
              subTitle={threadParentName}
              onClick={() => {
                if (!threadParentChannel) return;
                chatSelectedActions.select(threadParentChannel);
                onClose();
              }}
            />
            <NavRow
              title="GROUP.md"
              subTitle={
                hasThreadMd
                  ? tt("channelSetting.configuredV", { values: { v: threadMdVersion } })
                  : tt("channelSetting.notConfigured")
              }
              onClick={() => setSubpage("md")}
            />
          </SectionGroup>
        ) : null}

        {!isThread ? (
          <SectionGroup>
            <ToggleRow
              title={tt("channelSetting.mute")}
              checked={isMuted}
              loading={muteMu.isPending}
              onChange={(v) => muteMu.mutate(v)}
            />
            <ToggleRow
              title={tt("channelSetting.pin")}
              checked={isTop}
              loading={topMu.isPending}
              onChange={(v) => topMu.mutate(v)}
            />
            {isGroup ? (
              <ToggleRow
                title={tt("channelSetting.saveToContacts")}
                checked={isSaved}
                loading={saveMu.isPending}
                onChange={(v) => saveMu.mutate(v)}
              />
            ) : null}
          </SectionGroup>
        ) : null}

        {isThread ? (
          <SectionGroup>
            <ToggleRow
              title={tt("channelSetting.mute")}
              checked={isMuted}
              loading={muteMu.isPending}
              onChange={(v) => muteMu.mutate(v)}
            />
          </SectionGroup>
        ) : null}

        {isGroup ? (
          <SectionGroup>
            <InlineEditRow
              title={tt("channelSetting.myNickname")}
              value={myNickname}
              placeholder={tt("channelSetting.notSet")}
              canEdit
              maxLength={20}
              pending={myNickMu.isPending}
              editing={editing === "myNickname"}
              onEnterEdit={() => setEditing("myNickname")}
              onCancel={() => setEditing(null)}
              onSave={(v) => myNickMu.mutate(v)}
            />
          </SectionGroup>
        ) : null}

        {/* 子区管理(对齐老仓"子区管理"组):归档/取消归档(canArchiveThisThread 才显)
            + 离开/解散同组;非子区时 clearMessages + dangerClose 同组(原来逻辑) */}
        <SectionGroup>
          {!isThread ? (
            <NavRow
              title={tt("channelSetting.clearMessages")}
              danger
              onClick={() => setConfirmClear(true)}
            />
          ) : null}
          {isThread && canArchiveThisThread ? (
            <NavRow
              title={
                isThreadArchived ? tt("threadPanelLocal.unarchive") : tt("threadPanelLocal.archive")
              }
              center
              onClick={() => setConfirmArchive(true)}
            />
          ) : null}
          <NavRow
            title={dangerCloseTitle}
            danger
            center={isThread}
            onClick={() => {
              if (isGroup && iAmOwner) {
                setOwnerLeaveBlocked(true);
                return;
              }
              setConfirmClose(true);
            }}
          />
        </SectionGroup>
      </BaseDrawer>

      <ChannelMembersModal
        open={kickListOpen}
        channel={channel}
        onClose={() => setKickListOpen(false)}
      />

      {addOpen ? (
        <AddMembersModal open channel={channel} onClose={() => setAddOpen(false)} />
      ) : null}

      <GroupAvatarModal
        open={subpage === "avatar"}
        channel={channel}
        channelTitle={title}
        canEdit={iAmOwnerOrManager}
        onClose={() => setSubpage(null)}
      />

      <GroupQrcodeModal
        open={subpage === "qrcode"}
        channel={channel}
        channelTitle={title}
        inviteVerifyOn={inviteVerifyOn}
        onClose={() => setSubpage(null)}
      />

      <GroupMdModal
        open={subpage === "md"}
        channel={channel}
        canEdit={iAmOwnerOrManager}
        onClose={() => setSubpage(null)}
      />

      <GroupManagementModal
        open={subpage === "manage"}
        channel={channel}
        channelInfo={channelInfo ?? undefined}
        isOwner={iAmOwner}
        canManage={iAmOwnerOrManager}
        onClose={() => setSubpage(null)}
      />

      <IncomingWebhookPanel
        open={subpage === "webhook"}
        channel={channel}
        isManager={iAmOwnerOrManager}
        title={tt("module.channelSettings.incomingWebhook")}
        onClose={() => setSubpage(null)}
      />

      {confirmClear ? (
        <ConfirmDialog
          open
          title={tt("channelSetting.confirmClearTitle")}
          content={tt("channelSetting.confirmClearContent")}
          okDanger
          okText={tt("channelSetting.clear")}
          okLoading={clearMu.isPending}
          onOk={() => clearMu.mutate()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmDialog
          open
          title={tt("channelSetting.confirmActionTitle")}
          content={dangerCloseConfirm}
          okText={
            isGroup
              ? tt("channelSetting.exit")
              : isThread
                ? tt("channelSetting.leave")
                : tt("channelSetting.close")
          }
          okDanger
          okLoading={closeMu.isPending}
          onOk={() => closeMu.mutate()}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}

      {confirmArchive ? (
        <ConfirmDialog
          open
          title={
            isThreadArchived
              ? tt("threadPanelLocal.unarchiveConfirmTitle", { values: { name: title } })
              : tt("threadPanelLocal.archiveConfirmTitle", { values: { name: title } })
          }
          content={
            isThreadArchived
              ? tt("threadPanelLocal.unarchiveConfirmContent")
              : tt("threadPanelLocal.archiveConfirmContent")
          }
          okText={
            isThreadArchived ? tt("threadPanelLocal.unarchive") : tt("threadPanelLocal.archive")
          }
          okLoading={archiveMu.isPending}
          onOk={() => archiveMu.mutate()}
          onCancel={() => setConfirmArchive(false)}
        />
      ) : null}

      {ownerLeaveBlocked ? (
        <ConfirmDialog
          open
          title={tt("channelSetting.ownerLeaveBlockedTitle")}
          content={tt("channelSetting.ownerLeaveBlockedContent")}
          okText={tt("channelSetting.groupManagement")}
          onOk={() => {
            setOwnerLeaveBlocked(false);
            setSubpage("manage");
          }}
          onCancel={() => setOwnerLeaveBlocked(false)}
        />
      ) : null}

      {isGroup && selectedMemberId ? (
        <UserInfoModal
          uid={selectedMemberId}
          groupNo={isGroup ? channel.channelID : undefined}
          onMessageStart={onClose}
          onClose={() => setSelectedMemberId(null)}
        />
      ) : null}
    </>
  );
}
