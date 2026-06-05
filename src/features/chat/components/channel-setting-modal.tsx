import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Subscriber,
} from "wukongimjssdk";
import { Minus, Plus, QrCode, X } from "lucide-react";
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
import { useDrawerEnterTransition } from "@/features/chat/hooks/use-drawer-enter-transition.hook";
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
// section-form 共享原语(Phase C:本文件原内嵌的 SectionGroup/NavRow/ToggleRow/InlineEditRow/Switch
// 已抽到 features/base/components/section-form/,改为 import;100% 等价无视觉/行为变化)
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { ToggleRow } from "@/features/base/components/section-form/toggle-row";
import { InlineEditRow } from "@/features/base/components/section-form/inline-edit-row";

interface ChannelSettingModalProps {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;
const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

/** 4 个二级抽屉 token,与 NavRow → setSubpage 一一对应。 */
type Subpage = "avatar" | "qrcode" | "md" | "manage";

/**
 * 成员九宫格(对应旧 dmworkbase Subscribers 组件):
 *   头像 + name(truncate)+ 角色 badge,5 列 grid。末尾两个圆形动作按钮:
 *     - ➕加成员(canAdd 时,非子区)
 *     - ➖踢人(canManage 时;新项目复用 ChannelMembersModal 的 ⋮ 菜单移出)
 *
 * 旧版"踢人"是独立 SubscriberList + 多选 + 完成,这里偏简化:点 ➖ 打开
 * ChannelMembersModal,用户在里面用 ⋮ → 移出 单条踢。批量后续再做。
 */
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
            aria-label="加成员"
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
            aria-label="移出成员"
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
  const display = subscriber.remark || subscriber.name || subscriber.uid;
  const ch = new Channel(subscriber.uid, ChannelTypePerson);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        <ChannelAvatar channel={ch} size={48} title={display} />
        {subscriber.role === ROLE_OWNER ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-warning px-1 py-px text-[9px] leading-none font-semibold whitespace-nowrap text-white">
            群主
          </span>
        ) : subscriber.role === ROLE_MANAGER ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-sm bg-brand px-1 py-px text-[9px] leading-none font-semibold whitespace-nowrap text-white">
            管理员
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
 * 频道设置抽屉(对应旧 dmworkbase ChannelSetting,1:1 字段对齐):
 *
 *   ┌ Header(聊天信息(N) + X 关闭)
 *   ├ 成员九宫格(头像+role badge + ➕加成员 + ➖踢人)
 *   ├ Section: 群基础(群聊名称/群头像/群二维码/群公告/GROUP.md/群管理/备注)
 *   ├ Section: 通知(消息免打扰 / 聊天置顶 / 保存到通讯录)
 *   ├ Section: 我在本群的昵称
 *   └ Section: 危险(清空聊天记录 / 删除并退出)
 *
 * 文本字段(群名/公告/备注/我的昵称)按用户要求改为抽屉内 inline 编辑;
 * 4 个二级页(群头像 / 群二维码 / GROUP.md / 群管理)走独立 z-[70] 抽屉,
 * 对应组件:GroupAvatarModal / GroupQrcodeModal / GroupMdModal / GroupManagementModal。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kickListOpen, setKickListOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [subpage, setSubpage] = useState<Subpage | null>(null);
  const entered = useDrawerEnterTransition(open);

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
  // 子区抽屉对齐截图,header 不带 (N) 计数(截图 "聊天信息(0)" 中的 0 用户要求忽略)
  const headerCount = isGroup ? memberCount : undefined;

  // 子区抽屉专属 — 父群 / 改名权限 / GROUP.md 元数据
  // (对齐旧 dmworkbase module.tsx line 1883-2076)
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const muteMu = useMutation({
    mutationFn: (mute: boolean) => setChannelMute(channel, mute),
    onSuccess: refreshChannelInfo,
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const saveMu = useMutation({
    mutationFn: (save: boolean) => setChannelSave(channel, save),
    onSuccess: refreshChannelInfo,
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const renameMu = useMutation({
    mutationFn: async (name: string) => {
      if (isThread) {
        const p = parseThreadChannelId(channel.channelID);
        if (!p) throw new Error("子区 ID 解析失败");
        await updateThread(p.groupNo, p.shortId, { name });
      } else {
        await updateGroup(channel.channelID, { name });
      }
    },
    onSuccess: async () => {
      // 改名后强制刷 channelInfo:先清缓存再 fetch,避免 fetchChannelInfo 命中旧缓存
      // (对齐旧 module.tsx line 1934-1938 deleteChannelInfo + fetchChannelInfo)
      WKSDK.shared().channelManager.deleteChannelInfo(channel);
      await WKSDK.shared().channelManager.fetchChannelInfo(channel);
      setEditing(null);
      toast.success("已修改");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "修改失败"),
  });

  const noticeMu = useMutation({
    mutationFn: (next: string) => updateGroup(channel.channelID, { notice: next }),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      toast.success("已修改");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "修改失败"),
  });

  const remarkMu = useMutation({
    mutationFn: (next: string) => setChannelRemark(channel, next),
    onSuccess: () => {
      refreshChannelInfo();
      setEditing(null);
      toast.success("已修改");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "修改失败"),
  });

  const myNickMu = useMutation({
    mutationFn: (next: string) => updateGroupMember(channel.channelID, myUid, { name: next }),
    onSuccess: () => {
      void WKSDK.shared().channelManager.syncSubscribes(channel);
      setEditing(null);
      toast.success("已修改");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "修改失败"),
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
      toast.success("已清空聊天记录");
      setConfirmClear(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "清空失败"),
  });

  const closeMu = useMutation({
    mutationFn: async () => {
      if (isThread) {
        // 子区:走 leaveThread 真离开(对应旧 dmworkdatasource threadLeave)
        const p = parseThreadChannelId(channel.channelID);
        if (!p) throw new Error("子区 ID 解析失败");
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
      toast.success(isGroup ? "已退出群聊" : isThread ? "已离开子区" : "已关闭聊天");
      setConfirmClose(false);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  if (!open) return null;

  const dangerCloseTitle = isGroup ? "删除并退出" : isThread ? "离开子区" : "关闭聊天窗口";
  const dangerCloseConfirm = isGroup
    ? "确定要退出群聊吗?"
    : isThread
      ? "确定要离开子区吗?"
      : "确定要关闭此聊天窗口吗?";

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* drawer panel — 右侧滑入(对齐旧 dmworkbase ChannelSetting transform 滑入) */}
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-md transform flex-col overflow-hidden border-l border-border-default bg-bg-surface shadow-xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            {typeof headerCount === "number" ? `聊天信息(${headerCount})` : "聊天信息"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          {/* 成员九宫格仅 group(子区抽屉对齐截图不显示成员) */}
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
                title="群聊名称"
                value={title}
                placeholder="未设置"
                canEdit={iAmOwnerOrManager}
                cantEditMessage="只有管理者才能修改群名字"
                maxLength={20}
                pending={renameMu.isPending}
                editing={editing === "name"}
                onEnterEdit={() => setEditing("name")}
                onCancel={() => setEditing(null)}
                onSave={(v) => renameMu.mutate(v)}
              />
              <NavRow
                title="群头像"
                right={<ChannelAvatar channel={channel} size={24} title={title} />}
                onClick={() => setSubpage("avatar")}
              />
              <NavRow
                title="群二维码"
                right={<QrCode size={16} className="text-text-tertiary" />}
                onClick={() => setSubpage("qrcode")}
              />
              <InlineEditRow
                title="群公告"
                value={notice}
                placeholder="未设置"
                canEdit={iAmOwnerOrManager}
                cantEditMessage="只有管理者才能修改群公告"
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
                subTitle={hasGroupMd ? `已配置 v${groupMdVersion}` : "未配置"}
                onClick={() => setSubpage("md")}
              />
              {iAmOwnerOrManager ? (
                <NavRow title="群管理" onClick={() => setSubpage("manage")} />
              ) : null}
              <InlineEditRow
                title="备注"
                value={remark}
                placeholder="群聊的备注仅自己可见"
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

          {/* 子区抽屉 base.info: 子区名称 + 返回群聊「父群名」(对齐截图) */}
          {isThread ? (
            <SectionGroup>
              <InlineEditRow
                title="子区名称"
                value={title}
                placeholder="未设置"
                canEdit={canEditThreadName}
                cantEditMessage="只有子区创建者或群管理者才能修改名称"
                maxLength={50}
                pending={renameMu.isPending}
                editing={editing === "name"}
                onEnterEdit={() => setEditing("name")}
                onCancel={() => setEditing(null)}
                onSave={(v) => renameMu.mutate(v)}
              />
              <NavRow
                title={`返回群聊「${threadParentName}」`}
                center
                onClick={() => {
                  if (!threadParentChannel) return;
                  chatSelectedActions.select(threadParentChannel);
                  onClose();
                }}
              />
            </SectionGroup>
          ) : null}

          {/* 子区抽屉 GROUP.md(对齐旧 module.tsx thread.md.setting line 1978-2043) */}
          {isThread ? (
            <SectionGroup>
              <NavRow
                title="GROUP.md"
                subTitle={hasThreadMd ? `已配置 v${threadMdVersion}` : "未配置"}
                onClick={() => setSubpage("md")}
              />
            </SectionGroup>
          ) : null}

          {!isThread ? (
            <SectionGroup>
              <ToggleRow
                title="消息免打扰"
                checked={isMuted}
                loading={muteMu.isPending}
                onChange={(v) => muteMu.mutate(v)}
              />
              <ToggleRow
                title="聊天置顶"
                checked={isTop}
                loading={topMu.isPending}
                onChange={(v) => topMu.mutate(v)}
              />
              {isGroup ? (
                <ToggleRow
                  title="保存到通讯录"
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
                title="我在本群的昵称"
                value={myNickname}
                placeholder="未设置"
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

          {/* danger Section — 子区只显示"离开子区"(截图无"清空聊天记录") */}
          <SectionGroup>
            {!isThread ? (
              <NavRow title="清空聊天记录" danger onClick={() => setConfirmClear(true)} />
            ) : null}
            <NavRow
              title={dangerCloseTitle}
              danger
              center={isThread}
              onClick={() => setConfirmClose(true)}
            />
          </SectionGroup>
        </div>
      </aside>

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
          title="确认清空"
          content="确定要清空所有聊天记录吗?该操作不可撤销。"
          okDanger
          okText="清空"
          okLoading={clearMu.isPending}
          onOk={() => clearMu.mutate()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmModal
          open
          title="确认操作"
          content={dangerCloseConfirm}
          okText={isGroup ? "退出" : isThread ? "离开" : "关闭"}
          okDanger
          okLoading={closeMu.isPending}
          onOk={() => closeMu.mutate()}
          onCancel={() => setConfirmClose(false)}
        />
      ) : null}
    </div>
  );
}
