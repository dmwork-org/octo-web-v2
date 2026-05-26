import { useEffect, useRef, useState } from "react";
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
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
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
import { updateGroup, updateGroupMember } from "@/features/base/api/endpoints/group.api";

interface ChannelSettingModalProps {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts)。 */
const CHANNEL_TYPE_THREAD = 5;
const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

/** open 翻转后下一帧 entered=true 触发 transition,与 ChannelMembersModal 同款。 */
function useEnterTransition(open: boolean) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [open]);
  return entered;
}

/** editing 由 false → true 时把 draft 同步成最新 value(避免上次编辑残留)。 */
function useSyncDraftOnEnterEdit(editing: boolean, value: string, setDraft: (v: string) => void) {
  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value, setDraft]);
}

/** 编辑态打开下一帧把焦点切给 input(对齐旧 InputEdit 进入即聚焦)。 */
function useFocusOnEnterEdit(
  editing: boolean,
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* select 不支持 type 的 input(如 number)会抛,忽略 */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [editing, ref]);
}

/** 极简 Switch(toggle 视觉用户允许不强求 1:1,功能正确即可)。 */
function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-success" : "bg-bg-elevated"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SectionGroup({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-4 mb-2 flex flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base">
      {children}
    </section>
  );
}

function NavRow({
  title,
  subTitle,
  right,
  danger,
  onClick,
}: {
  title: string;
  subTitle?: React.ReactNode;
  right?: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors ${
        onClick ? "hover:bg-bg-hover" : "cursor-default"
      }`}
    >
      <span
        className={`flex-1 truncate text-[13px] ${danger ? "text-error" : "text-text-primary"}`}
      >
        {title}
      </span>
      {subTitle ? (
        <span className="shrink-0 truncate text-[12px] text-text-tertiary">{subTitle}</span>
      ) : null}
      {right ? <span className="shrink-0">{right}</span> : null}
    </button>
  );
}

function ToggleRow({
  title,
  checked,
  loading,
  onChange,
}: {
  title: string;
  checked: boolean;
  loading: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2 px-4 py-2.5">
      <span className="flex-1 truncate text-[13px] text-text-primary">{title}</span>
      <Switch checked={checked} disabled={loading} onChange={onChange} />
    </div>
  );
}

/**
 * 文本字段 inline 编辑(对应旧 InputEdit 二级页 → 用户要求改为抽屉内 inline):
 *
 * 视图态:title 左 + value/placeholder 右,可点击进入编辑(若 canEdit=false 点击
 * Toast 提示)。
 * 编辑态:title 左 + input/textarea + 取消/保存按钮。
 *
 * Enter 键:input 模式直接保存;textarea 模式 Cmd+Enter 保存(避免误触换行)。
 * Esc:取消并退出。
 */
function InlineEditRow({
  title,
  value,
  placeholder,
  canEdit,
  cantEditMessage,
  multiline,
  maxLength,
  pending,
  editing,
  onEnterEdit,
  onCancel,
  onSave,
}: {
  title: string;
  value: string;
  placeholder?: string;
  canEdit: boolean;
  cantEditMessage?: string;
  multiline?: boolean;
  maxLength?: number;
  pending: boolean;
  editing: boolean;
  onEnterEdit: () => void;
  onCancel: () => void;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useSyncDraftOnEnterEdit(editing, value, setDraft);
  useFocusOnEnterEdit(editing, multiline ? textareaRef : inputRef);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!canEdit) {
            if (cantEditMessage) toast.warning(cantEditMessage);
            return;
          }
          onEnterEdit();
        }}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        <span className="flex-1 truncate text-[13px] text-text-primary">{title}</span>
        <span className="shrink-0 max-w-[60%] truncate text-[12px] text-text-tertiary">
          {value || placeholder || "未设置"}
        </span>
      </button>
    );
  }

  const trySave = () => {
    const next = draft.trim();
    if (next === value.trim()) {
      onCancel();
      return;
    }
    onSave(next);
  };

  return (
    <div className="flex w-full flex-col gap-2 px-4 py-2.5">
      <span className="text-[13px] text-text-primary">{title}</span>
      {multiline ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              trySave();
            }
          }}
          className="min-h-16 w-full resize-y rounded-md border border-border-default bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
      ) : (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter") {
              e.preventDefault();
              trySave();
            }
          }}
          className="w-full rounded-md border border-border-default bg-bg-surface px-2 py-1.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-md px-3 py-1 text-[12px] text-text-tertiary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={trySave}
          disabled={pending}
          className="rounded-md bg-brand px-3 py-1 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

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
 * 文本字段(群名/公告/备注/我的昵称)按用户要求改为抽屉内 inline 编辑,不再走旧版
 * 二级 InputEdit 页;头像/二维码/GROUP.md/群管理 二级页暂用 toast 占位,后续 MR 补。
 */
export function ChannelSettingModal({ open, channel, onClose }: ChannelSettingModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [kickListOpen, setKickListOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const entered = useEnterTransition(open);

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
      }
    | undefined;
  const isSaved = orgData?.save === 1;
  const notice = orgData?.notice ?? "";
  const remark = orgData?.remark ?? "";
  const hasGroupMd = !!orgData?.has_group_md;
  const groupMdVersion = orgData?.group_md_version ?? 0;

  const subscribers = useGroupSubscribers(channel, open && (isGroup || isThread));
  const me = subscribers.find((s) => s.uid === myUid);
  const myRole = me?.role ?? 0;
  const iAmOwnerOrManager = myRole === ROLE_OWNER || myRole === ROLE_MANAGER;
  const myNickname = me?.remark || me?.name || "";

  const memberCountFromSubs = subscribers.length;
  const memberCount = memberCountFromSubs > 0 ? memberCountFromSubs : (orgData?.member_count ?? 0);
  const headerCount = isGroup || isThread ? memberCount : undefined;

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
    mutationFn: (name: string) => updateGroup(channel.channelID, { name }),
    onSuccess: () => {
      refreshChannelInfo();
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
    mutationFn: () =>
      deleteConversation({
        channelId: channel.channelID,
        channelType: channel.channelType,
      }),
    onSuccess: () => {
      WKSDK.shared().conversationManager.removeConversation(channel);
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      if (chatSelectedStore.state.channel?.channelID === channel.channelID) {
        chatSelectedActions.clear();
      }
      toast.success(isGroup ? "已退出群聊" : "已关闭聊天");
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
          {isGroup || isThread ? (
            <SubscribersGrid
              subscribers={subscribers}
              canAdd={isGroup}
              canManage={isGroup && iAmOwnerOrManager}
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
                onClick={() => toast.info("群头像编辑将在后续 MR 补充")}
              />
              <NavRow
                title="群二维码"
                right={<QrCode size={16} className="text-text-tertiary" />}
                onClick={() => toast.info("群二维码将在后续 MR 补充")}
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
                onClick={() => toast.info("GROUP.md 编辑将在后续 MR 补充")}
              />
              {iAmOwnerOrManager ? (
                <NavRow title="群管理" onClick={() => toast.info("群管理将在后续 MR 补充")} />
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

          <SectionGroup>
            <NavRow title="清空聊天记录" danger onClick={() => setConfirmClear(true)} />
            <NavRow title={dangerCloseTitle} danger onClick={() => setConfirmClose(true)} />
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
