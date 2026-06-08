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
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

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
 */
export function ChannelMembersModal({ open, channel, onClose }: ChannelMembersDrawerProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const subscribers = useGroupSubscribers(channel, open);
  const [keyword, setKeyword] = useState("");
  const [menuFor, setMenuFor] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [confirmKickUid, setConfirmKickUid] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
      if (!groupChannel) return Promise.reject(new Error(t("channelMembers.error.invalidChannel")));
      return addGroupManagers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success(t("channelMembers.toast.promoted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelMembers.toast.promoteFailed")),
  });

  const demoteMu = useMutation({
    mutationFn: (uid: string) => {
      if (!groupChannel) return Promise.reject(new Error(t("channelMembers.error.invalidChannel")));
      return removeGroupManagers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success(t("channelMembers.toast.demoted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelMembers.toast.demoteFailed")),
  });

  const kickMu = useMutation({
    mutationFn: (uid: string) => {
      if (!groupChannel) return Promise.reject(new Error(t("channelMembers.error.invalidChannel")));
      return removeGroupMembers(groupChannel.channelID, [uid]);
    },
    onSuccess: () => {
      refreshSubs();
      toast.success(t("channelMembers.toast.kicked"));
      setConfirmKickUid(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("channelMembers.toast.kickFailed")),
  });

  const buildMenuItems = (target: Subscriber): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (target.uid === myUid) return items;
    if (iAmOwner) {
      if (target.role === ROLE_NORMAL) {
        items.push({
          label: t("channelMembers.action.setManager"),
          onClick: () => promoteMu.mutate(target.uid),
        });
      } else if (target.role === ROLE_MANAGER) {
        items.push({
          label: t("channelMembers.action.unsetManager"),
          onClick: () => demoteMu.mutate(target.uid),
        });
      }
      if (target.role !== ROLE_OWNER) {
        items.push({
          label: t("channelMembers.action.kick"),
          danger: true,
          onClick: () => setConfirmKickUid(target.uid),
        });
      }
    } else if (iAmManager) {
      if (target.role === ROLE_NORMAL) {
        items.push({
          label: t("channelMembers.action.kick"),
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
            <span className="truncate">
              {tt("channelMembers.titleWithCount", { values: { count: subscribers.length } })}
            </span>
            {showAddBtn ? (
              <Button type="primary" theme="solid" size="small" onClick={() => setAddOpen(true)}>
                {tt("channelMembers.addMember")}
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
              placeholder={tt("channelMembers.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <ul className="flex flex-1 flex-col overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {keyword ? tt("channelMembers.noMatches") : tt("channelMembers.noMembers")}
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
                        {tt("channelMembers.me")}
                      </span>
                    ) : null}
                    {m.role === ROLE_OWNER ? (
                      <span className="shrink-0 rounded-sm bg-warning/10 px-1 text-[10px] font-semibold text-warning">
                        {tt("channelMembers.owner")}
                      </span>
                    ) : m.role === ROLE_MANAGER ? (
                      <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                        {tt("channelMembers.manager")}
                      </span>
                    ) : null}
                    {isBot ? (
                      <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                        {tt("channelMembers.aiTag")}
                      </span>
                    ) : null}
                  </div>
                  {menuItems.length > 0 ? (
                    <button
                      type="button"
                      aria-label={tt("channelMembers.actionAria")}
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

      {confirmKickUid ? (
        <ConfirmModal
          open
          title={tt("channelMembers.confirmKickTitle")}
          content={
            kickTargetName
              ? tt("channelMembers.confirmKickWithName", { values: { name: kickTargetName } })
              : tt("channelMembers.confirmKick")
          }
          okText={tt("channelMembers.action.kick")}
          okDanger
          okLoading={kickMu.isPending}
          onOk={() => kickMu.mutate(confirmKickUid)}
          onCancel={() => setConfirmKickUid(null)}
        />
      ) : null}

      {addOpen && groupChannel ? (
        <AddMembersModal open channel={groupChannel} onClose={() => setAddOpen(false)} />
      ) : null}
    </>
  );
}
