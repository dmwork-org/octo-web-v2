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
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ChannelMembersModal } from "@/features/chat/components/channel-members-modal";
import { AddMembersModal } from "@/features/chat/components/add-members-modal";
import { GroupAvatarModal } from "@/features/chat/components/group-avatar-modal";
import { GroupQrcodeModal } from "@/features/chat/components/group-qrcode-modal";
import { GroupMdModal } from "@/features/chat/components/group-md-modal";
import { GroupManagementModal } from "@/features/chat/components/group-management-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
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
  leaveThread,
  updateGroup,
  updateGroupMember,
  updateThread,
} from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
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

type Subpage = "avatar" | "qrcode" | "md" | "manage";

function SubscribersGrid({
  subscribers,
  canAdd,
  canManage,
  onAdd,
  onKickMode,
}: {
  subscribers: Subscriber[];
  canAdd: boolean;
  canManage: boolean;
  onAdd: () => void;
  onKickMode: () => void;
}) {
  const tt = useT();
  return (
    <section className="mx-4 mb-2 rounded-md border border-border-subtle bg-bg-base px-2 py-3">
      <div className="grid grid-cols-5 gap-y-3">
        {subscribers.map((m) => (
          <SubscriberCell key={m.uid} subscriber={m} />
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
    </section>
  );
}

function SubscriberCell({ subscriber }: { subscriber: Subscriber }) {
  const tt = useT();
  const display = subscriber.remark || subscriber.name || subscriber.uid;
  const ch = new Channel(subscriber.uid, ChannelTypePerson);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
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
      </div>
      <span className="block w-full max-w-16 truncate text-center text-[11px] text-text-secondary">
        {display}
      </span>
    </div>
  );
}

/**
 * 频道设置抽屉(对应旧 dmworkbase ChannelSetting,1:1 字段对齐)。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kickListOpen, setKickListOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [subpage, setSubpage] = useState<Subpage | null>(null);

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
  const hasThreadMd = !!(channelInfo?.orgData as { has_thread_md?: boolean } | undefined)
    ?.has_thread_md;
  const threadMdVersion =
    (channelInfo?.orgData as { thread_md_version?: number } | undefined)?.thread_md_version ?? 0;

  const refreshChannelInfo = () => {
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  };

  const topMu = useMutation({
    mutationFn: (top: boolean) => setChannelTop(channel, top),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const muteMu = useMutation({
    mutationFn: (mute: boolean) => setChannelMute(channel, mute),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const saveMu = useMutation({
    mutationFn: (save: boolean) => setChannelSave(channel, save),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
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
      toast.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const noticeMu = useMutation({
    mutationFn: (next: string) => updateGroup(channel.channelID, { notice: next }),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      toast.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const remarkMu = useMutation({
    mutationFn: (next: string) => setChannelRemark(channel, next),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      toast.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
  });

  const myNickMu = useMutation({
    mutationFn: (next: string) => updateGroupMember(channel.channelID, myUid, { name: next }),
    onSuccess: () => {
      void WKSDK.shared().channelManager.syncSubscribes(channel);
      setEditing(null);
      toast.success(t("channelSetting.toast.updated"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.updateFailed")),
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
      toast.success(t("channelSetting.toast.cleared"));
      setConfirmClear(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.clearFailed")),
  });

  const closeMu = useMutation({
    mutationFn: async () => {
      if (isThread) {
        const p = parseThreadChannelId(channel.channelID);
        if (!p) throw new Error(t("channelSetting.error.threadParseFailed"));
        await leaveThread(p.shortId);
      } else {
        await deleteConversation({
          channelId: channel.channelID,
          channelType: channel.channelType,
        });
      }
      WKSDK.shared().conversationManager.removeConversation(channel);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      if (chatSelectedStore.state.channel?.channelID === channel.channelID) {
        chatSelectedActions.clear();
      }
      toast.success(
        isGroup
          ? t("channelSetting.toast.leftGroup")
          : isThread
            ? t("channelSetting.toast.leftThread")
            : t("channelSetting.toast.closedChat"),
      );
      setConfirmClose(false);
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelSetting.toast.opFailed")),
  });

  const dangerCloseTitle = isGroup
    ? tt("channelSetting.dangerCloseGroup")
    : isThread
      ? tt("channelSetting.dangerCloseThread")
      : tt("channelSetting.dangerCloseChat");
  const dangerCloseConfirm = isGroup
    ? tt("channelSetting.confirmLeaveGroup")
    : isThread
      ? tt("channelSetting.confirmLeaveThread")
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
        title={
          typeof headerCount === "number"
            ? tt("channelSetting.titleWithCount", { values: { count: headerCount } })
            : tt("channelSetting.title")
        }
      >
        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          {isGroup ? (
            <SubscribersGrid
              subscribers={subscribers}
              canAdd
              canManage={iAmOwnerOrManager}
              onAdd={() => setAddOpen(true)}
              onKickMode={() => setKickListOpen(true)}
            />
          ) : null}

          {isPerson ? (
            <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-3">
              <ChannelAvatar channel={channel} size={56} title={title} />
              <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            </div>
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
                title={tt("channelSetting.backToParent", { values: { name: threadParentName } })}
                center
                onClick={() => {
                  if (!threadParentChannel) return;
                  chatSelectedActions.select(threadParentChannel);
                  onClose();
                }}
              />
            </SectionGroup>
          ) : null}

          {isThread ? (
            <SectionGroup>
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

          <SectionGroup>
            {!isThread ? (
              <NavRow
                title={tt("channelSetting.clearMessages")}
                danger
                onClick={() => setConfirmClear(true)}
              />
            ) : null}
            <NavRow
              title={dangerCloseTitle}
              danger
              center={isThread}
              onClick={() => setConfirmClose(true)}
            />
          </SectionGroup>
        </div>
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
        isOwner={iAmOwner}
        onClose={() => setSubpage(null)}
      />

      {confirmClear ? (
        <ConfirmModal
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
        <ConfirmModal
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
    </>
  );
}
