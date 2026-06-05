import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Subscriber,
} from "wukongimjssdk";
import { MoreVertical, Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AddMembersModal } from "@/features/chat/components/add-members-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ContextMenu, type ContextMenuItem } from "@/features/base/components/context-menu";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import {
  addGroupManagers,
  removeGroupManagers,
  removeGroupMembers,
} from "@/features/base/api/endpoints/group.api";

/** ChannelType 5 = ChannelTypeCommunityTopic;子区。 */
const CHANNEL_TYPE_THREAD = 5;

/** GroupRole(对齐 dmworkbase Const.ts):0 normal / 1 owner / 2 manager。 */
const ROLE_NORMAL = 0;
const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

interface ChannelMembersDrawerProps {
  open: boolean;
  channel: Channel;
  onClose: () => void;
}

function findMyRole(members: Subscriber[], myUid: string): number {
  return members.find((m) => m.uid === myUid)?.role ?? ROLE_NORMAL;
}

/**
 * 群成员管理抽屉(对应旧 dmworkbase Subscribers + GroupManagement)。
 *
 * 浮动元素壳层统一规范 Phase D — 走 BaseDrawer side=right;在 channel-setting 内开,
 * 自动 z-dialog-secondary。Header 标题 + 加成员 button(custom)+ X。
 */
export function ChannelMembersModal({ open, channel, onClose }: ChannelMembersDrawerProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const subscribers = useGroupSubscribers(channel, open);
  const [keyword, setKeyword] = useState("");
  const [menuFor, setMenuFor] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [confirmKickUid, setConfirmKickUid] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // 子区 → 父群 channel(用于发 mutation API 和加成员 picker)
  const groupChannel = useMemo(() => {
    if (channel.channelType !== CHANNEL_TYPE_THREAD) return channel;
    const parsed = parseThreadChannelId(channel.channelID);
    if (!parsed) return null;
    return new Channel(parsed.groupNo, ChannelTypeGroup);
  }, [channel]);

  const myRole = findMyRole(subscribers, myUid);
  const iAmOwner = myRole === ROLE_OWNER;
  const iAmManager = myRole === ROLE_MANAGER;
  const canManage = iAmOwner || iAmManager;

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return subscribers;
    return subscribers.filter((s) => {
      const name = (s.remark || s.name || s.uid).toLowerCase();
      return name.includes(kw) || s.uid.toLowerCase().includes(kw);
    });
  }, [subscribers, keyword]);

  const refreshSubs = () => {
    if (groupChannel) {
      void WKSDK.shared().channelManager.syncSubscribes(groupChannel);
    }
    void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
  };

  const promoteMu = useMutation({
    mutationFn: (uid: string) => {
      if (!groupChannel) return Promise.reject(new Error("无效会话"));
      return addGroupManagers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success("已设为管理员");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "设置失败"),
  });

  const demoteMu = useMutation({
    mutationFn: (uid: string) => {
      if (!groupChannel) return Promise.reject(new Error("无效会话"));
      return removeGroupManagers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success("已取消管理员");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "操作失败"),
  });

  const kickMu = useMutation({
    mutationFn: (uid: string) => {
      if (!groupChannel) return Promise.reject(new Error("无效会话"));
      return removeGroupMembers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success("已移出群聊");
      setConfirmKickUid(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "移出失败"),
  });

  const buildMenuItems = (target: Subscriber): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (target.uid === myUid) return items;
    if (iAmOwner) {
      if (target.role === ROLE_NORMAL) {
        items.push({
          label: "设为管理员",
          onClick: () => promoteMu.mutate(target.uid),
        });
      } else if (target.role === ROLE_MANAGER) {
        items.push({
          label: "取消管理员",
          onClick: () => demoteMu.mutate(target.uid),
        });
      }
      if (target.role !== ROLE_OWNER) {
        items.push({
          label: "移出群聊",
          danger: true,
          onClick: () => setConfirmKickUid(target.uid),
        });
      }
    } else if (iAmManager) {
      if (target.role === ROLE_NORMAL) {
        items.push({
          label: "移出群聊",
          danger: true,
          onClick: () => setConfirmKickUid(target.uid),
        });
      }
    }
    return items;
  };

  const isThreadCh = channel.channelType === CHANNEL_TYPE_THREAD;
  const showAddBtn = !isThreadCh && canManage;
  const kickTarget = confirmKickUid ? subscribers.find((s) => s.uid === confirmKickUid) : undefined;
  const kickTargetName = kickTarget ? kickTarget.remark || kickTarget.name || kickTarget.uid : "";

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
          <div className="flex items-center gap-2">
            <span className="truncate">成员({subscribers.length})</span>
            {showAddBtn ? (
              <Button type="primary" theme="solid" size="small" onClick={() => setAddOpen(true)}>
                加成员
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="shrink-0 px-5 py-2">
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
            <Search size={14} className="shrink-0 text-text-tertiary" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索成员"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <ul className="flex flex-1 flex-col overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {keyword ? "没有匹配的成员" : "暂无成员"}
            </li>
          ) : (
            filtered.map((m) => {
              const menuItems = buildMenuItems(m);
              const isMe = m.uid === myUid;
              const og = m.orgData as { robot?: number } | undefined;
              const isBot = og?.robot === 1;
              const display = m.remark || m.name || m.uid;
              return (
                <li
                  key={m.uid}
                  className="group flex items-center gap-3 px-5 py-2 hover:bg-bg-hover"
                >
                  <ChannelAvatar
                    channel={new Channel(m.uid, ChannelTypePerson)}
                    size={32}
                    title={display}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm text-text-primary">{display}</span>
                    {isMe ? (
                      <span className="shrink-0 rounded-sm bg-bg-elevated px-1 text-[10px] text-text-tertiary">
                        我
                      </span>
                    ) : null}
                    {m.role === ROLE_OWNER ? (
                      <span className="shrink-0 rounded-sm bg-warning/10 px-1 text-[10px] font-semibold text-warning">
                        群主
                      </span>
                    ) : m.role === ROLE_MANAGER ? (
                      <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                        管理员
                      </span>
                    ) : null}
                    {isBot ? (
                      <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                        AI
                      </span>
                    ) : null}
                  </div>
                  {menuItems.length > 0 ? (
                    <button
                      type="button"
                      aria-label="操作"
                      onClick={(e) => setMenuFor({ uid: m.uid, x: e.clientX, y: e.clientY })}
                      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-elevated hover:text-text-primary group-hover:flex"
                    >
                      <MoreVertical size={14} />
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </BaseDrawer>

      {/* per-row 操作菜单(条件渲染避免 ContextMenu 在 open=false 时仍跑副作用) */}
      {menuFor ? (
        <ContextMenu
          open
          x={menuFor.x}
          y={menuFor.y}
          items={buildMenuItems(
            subscribers.find((s) => s.uid === menuFor.uid) ??
              ({ uid: menuFor.uid, role: ROLE_NORMAL } as Subscriber),
          )}
          onClose={() => setMenuFor(null)}
        />
      ) : null}

      {/* 移出群聊二次确认(条件渲染) */}
      {confirmKickUid ? (
        <ConfirmModal
          open
          title="确认移出"
          content={
            kickTargetName ? `确定要将 ${kickTargetName} 移出群聊吗?` : "确定要移出该成员吗?"
          }
          okText="移出"
          okDanger
          okLoading={kickMu.isPending}
          onOk={() => kickMu.mutate(confirmKickUid)}
          onCancel={() => setConfirmKickUid(null)}
        />
      ) : null}

      {/* 加成员 picker:子区 showAddBtn=false 不会进这里;groupChannel 一定是父群 */}
      {addOpen && groupChannel ? (
        <AddMembersModal open channel={groupChannel} onClose={() => setAddOpen(false)} />
      ) : null}
    </>
  );
}
