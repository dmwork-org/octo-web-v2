import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  type ChannelInfo,
  ChannelTypePerson,
  type Subscriber,
} from "wukongimjssdk";
import { Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import {
  addGroupManagers,
  removeGroupBotAdmin,
  removeGroupManagers,
  setGroupBotAdmin,
} from "@/features/base/api/endpoints/group.api";
import { setChannelAllowNoMention } from "@/features/base/api/endpoints/channel-setting.api";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { ToggleRow } from "@/features/base/components/section-form/toggle-row";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface GroupManagementModalProps {
  open: boolean;
  channel: Channel;
  /** 群 channelInfo,用于读 orgData.allow_no_mention 等设置态(可选,缺省时 toggle 走默认值)。 */
  channelInfo?: ChannelInfo;
  /** owner=1 / manager=2 / 其他=只读。本组件需要 isOwner 才能加/删管理员;manager 只能看。 */
  isOwner: boolean;
  /** owner 或 manager 都可控制群级 toggle(allow-no-mention 等);只读用户不显示 toggle section。 */
  canManage: boolean;
  onClose: () => void;
}

const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

type Mode = "view" | "addManager" | "addBotAdmin";

/**
 * 群管理二级抽屉(对应旧 dmworkbase GroupManagement)。
 *
 * **群级 toggle**(对齐上游 bbac882b — 从频道设置挪到群管理):
 *   - allow_no_mention(允许群内 Bot 免@回答)— owner / manager 可控
 */
export function GroupManagementModal({
  open,
  channel,
  channelInfo,
  isOwner,
  canManage,
  onClose,
}: GroupManagementModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const [mode, setMode] = useState<Mode>("view");
  const [confirmRemove, setConfirmRemove] = useState<{
    kind: "manager" | "botAdmin";
    uid: string;
    name: string;
  } | null>(null);
  const [pickedUids, setPickedUids] = useState<string[]>([]);
  const [keyword, setKeyword] = useState("");

  const subscribers = useGroupSubscribers(channel, open);

  const managers = useMemo(
    () =>
      subscribers
        .filter((s) => s.role === ROLE_OWNER || s.role === ROLE_MANAGER)
        .sort((a, b) => (a.role === ROLE_OWNER ? -1 : b.role === ROLE_OWNER ? 1 : 0)),
    [subscribers],
  );
  const botAdmins = useMemo(() => {
    return subscribers.filter((s) => {
      const og = s.orgData as { robot?: number; bot_admin?: number } | undefined;
      return og?.robot === 1 && og?.bot_admin === 1;
    });
  }, [subscribers]);

  const candidatePool = useMemo(() => {
    if (mode === "addManager") {
      return subscribers.filter((s) => {
        const og = s.orgData as { robot?: number } | undefined;
        return s.uid !== myUid && og?.robot !== 1 && (s.role ?? 0) === 0;
      });
    }
    if (mode === "addBotAdmin") {
      return subscribers.filter((s) => {
        const og = s.orgData as { robot?: number; bot_admin?: number } | undefined;
        return og?.robot === 1 && og.bot_admin !== 1;
      });
    }
    return [];
  }, [mode, subscribers, myUid]);

  const filteredPool = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return candidatePool;
    return candidatePool.filter((s) => {
      const name = (s.remark || s.name || s.uid).toLowerCase();
      return name.includes(kw) || s.uid.toLowerCase().includes(kw);
    });
  }, [candidatePool, keyword]);

  const refreshSubs = () => {
    void WKSDK.shared().channelManager.syncSubscribes(channel);
    void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
  };

  const refreshChannelInfo = () => {
    void WKSDK.shared().channelManager.fetchChannelInfo(channel);
  };

  const exitAddMode = () => {
    setMode("view");
    setPickedUids([]);
    setKeyword("");
  };

  const promoteMu = useMutation({
    mutationFn: (uids: string[]) => addGroupManagers(channel.channelID, uids),
    onSuccess: () => {
      refreshSubs();
      toast.success(t("groupMgmt.toast.managerAdded"));
      exitAddMode();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.addFailed")),
  });

  const demoteMu = useMutation({
    mutationFn: (uid: string) => removeGroupManagers(channel.channelID, [uid]),
    onSuccess: () => {
      refreshSubs();
      toast.success(t("groupMgmt.toast.managerRemoved"));
      setConfirmRemove(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.removeFailed")),
  });

  const setBotAdminMu = useMutation({
    mutationFn: (uid: string) => setGroupBotAdmin(channel.channelID, uid),
    onSuccess: () => {
      refreshSubs();
      toast.success(t("groupMgmt.toast.botAdminAdded"));
      exitAddMode();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.addFailed")),
  });

  const removeBotAdminMu = useMutation({
    mutationFn: (uid: string) => removeGroupBotAdmin(channel.channelID, uid),
    onSuccess: () => {
      refreshSubs();
      toast.success(t("groupMgmt.toast.botAdminRemoved"));
      setConfirmRemove(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.removeFailed")),
  });

  // 群级「允许群内 Bot 免@回答」开关(对齐上游 ceffa569):缺省 1(允许),零回归
  const allowNoMention =
    (channelInfo?.orgData as { allow_no_mention?: number } | undefined)?.allow_no_mention !== 0;
  const allowNoMentionMu = useMutation({
    mutationFn: (allow: boolean) => setChannelAllowNoMention(channel, allow),
    onSuccess: refreshChannelInfo,
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.opFailed")),
  });

  const togglePick = (uid: string) => {
    if (mode === "addBotAdmin") {
      setPickedUids(pickedUids[0] === uid ? [] : [uid]);
      return;
    }
    setPickedUids((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const onFinishPick = () => {
    if (pickedUids.length === 0) {
      toast.warning(t("groupMgmt.toast.selectMember"));
      return;
    }
    if (mode === "addManager") {
      promoteMu.mutate(pickedUids);
    } else if (mode === "addBotAdmin") {
      setBotAdminMu.mutate(pickedUids[0]);
    }
  };

  const inAddMode = mode !== "view";
  const addModeTitle =
    mode === "addManager" ? tt("groupMgmt.addManagerTitle") : tt("groupMgmt.addBotAdminTitle");
  const headerTitle = inAddMode ? addModeTitle : tt("groupMgmt.title");

  return (
    <>
      <BaseDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side="right"
        size="md"
        showCloseButton={!inAddMode}
        showBackButton={inAddMode}
        onBack={inAddMode ? exitAddMode : undefined}
        title={
          inAddMode ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate">{headerTitle}</span>
              <Button
                type="primary"
                theme="solid"
                size="small"
                loading={promoteMu.isPending || setBotAdminMu.isPending}
                disabled={pickedUids.length === 0}
                onClick={onFinishPick}
              >
                {pickedUids.length > 0
                  ? tt("groupMgmt.doneWithCount", { values: { count: pickedUids.length } })
                  : tt("groupMgmt.done")}
              </Button>
            </div>
          ) : (
            headerTitle
          )
        }
      >
        {inAddMode ? (
          <>
            <div className="shrink-0 px-5 py-2">
              <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
                <Search size={14} className="shrink-0 text-text-tertiary" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={tt("groupMgmt.searchPlaceholder")}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
              </div>
            </div>
            <ul className="flex flex-1 flex-col overflow-y-auto py-1">
              {filteredPool.length === 0 ? (
                <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                  {keyword ? tt("groupMgmt.noMatches") : tt("groupMgmt.noCandidates")}
                </li>
              ) : (
                filteredPool.map((m) => {
                  const display = m.remark || m.name || m.uid;
                  const picked = pickedUids.includes(m.uid);
                  return (
                    <li key={m.uid}>
                      <button
                        type="button"
                        onClick={() => togglePick(m.uid)}
                        className="flex w-full items-center gap-3 px-5 py-2 text-left transition-colors hover:bg-bg-hover"
                      >
                        <span
                          aria-checked={picked}
                          role="checkbox"
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            picked
                              ? "border-brand bg-brand text-white"
                              : "border-border-default bg-bg-surface"
                          }`}
                        >
                          {picked ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                        </span>
                        <ChannelAvatar
                          channel={new Channel(m.uid, ChannelTypePerson)}
                          size={32}
                          title={display}
                        />
                        <span className="flex-1 truncate text-sm text-text-primary">{display}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        ) : (
          <div className="flex flex-1 flex-col overflow-y-auto py-2">
            <ManagerSection
              title={tt("groupMgmt.ownerManagers")}
              members={managers}
              isOwner={isOwner}
              onAdd={() => setMode("addManager")}
              onRemove={(s) =>
                setConfirmRemove({
                  kind: "manager",
                  uid: s.uid,
                  name: s.remark || s.name || s.uid,
                })
              }
              addLabel={tt("groupMgmt.addManager")}
              showRoleBadge
            />
            <ManagerSection
              title={tt("groupMgmt.botAdmins")}
              members={botAdmins}
              isOwner={isOwner}
              onAdd={() => setMode("addBotAdmin")}
              onRemove={(s) =>
                setConfirmRemove({
                  kind: "botAdmin",
                  uid: s.uid,
                  name: s.remark || s.name || s.uid,
                })
              }
              addLabel={tt("groupMgmt.addBotAdmin")}
              emptyText={tt("groupMgmt.noBotAdmins")}
            />
            {canManage ? (
              <div className="mx-4 mb-3">
                <SectionGroup>
                  <ToggleRow
                    title={tt("groupMgmt.allowNoMention")}
                    checked={allowNoMention}
                    loading={allowNoMentionMu.isPending}
                    onChange={(v) => allowNoMentionMu.mutate(v)}
                  />
                </SectionGroup>
              </div>
            ) : null}
          </div>
        )}
      </BaseDrawer>

      {confirmRemove ? (
        <ConfirmModal
          open
          title={
            confirmRemove.kind === "manager"
              ? tt("groupMgmt.removeManagerTitle")
              : tt("groupMgmt.removeBotAdminTitle")
          }
          content={tt("groupMgmt.confirmRemoveContent", {
            values: {
              name: confirmRemove.name,
              role:
                confirmRemove.kind === "manager"
                  ? tt("groupMgmt.roleManager")
                  : tt("groupMgmt.roleBotAdmin"),
            },
          })}
          okText={tt("groupMgmt.removeOk")}
          okDanger
          okLoading={demoteMu.isPending || removeBotAdminMu.isPending}
          onOk={() => {
            if (confirmRemove.kind === "manager") demoteMu.mutate(confirmRemove.uid);
            else removeBotAdminMu.mutate(confirmRemove.uid);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
    </>
  );
}

function ManagerSection({
  title,
  members,
  isOwner,
  onAdd,
  onRemove,
  addLabel,
  emptyText,
  showRoleBadge,
}: {
  title: string;
  members: Subscriber[];
  isOwner: boolean;
  onAdd: () => void;
  onRemove: (s: Subscriber) => void;
  addLabel: string;
  emptyText?: string;
  showRoleBadge?: boolean;
}) {
  const tt = useT();
  return (
    <section className="mx-4 mb-3 flex shrink-0 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base">
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
        <span className="text-[12px] font-semibold text-text-secondary">{title}</span>
        {isOwner ? (
          <Button size="small" type="tertiary" onClick={onAdd}>
            {addLabel}
          </Button>
        ) : null}
      </div>
      {members.length === 0 ? (
        <div className="px-4 py-4 text-center text-[12px] text-text-tertiary">
          {emptyText ?? tt("groupMgmt.empty")}
        </div>
      ) : (
        <ul>
          {members.map((m) => {
            const display = m.remark || m.name || m.uid;
            const canRemove = isOwner && (showRoleBadge ? m.role === ROLE_MANAGER : true);
            return (
              <li
                key={m.uid}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-bg-hover"
              >
                <ChannelAvatar
                  channel={new Channel(m.uid, ChannelTypePerson)}
                  size={32}
                  title={display}
                />
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate text-sm text-text-primary">{display}</span>
                  {showRoleBadge && m.role === ROLE_OWNER ? (
                    <span className="shrink-0 rounded-sm bg-warning/10 px-1 text-[10px] font-semibold text-warning">
                      {tt("groupMgmt.roleOwner")}
                    </span>
                  ) : showRoleBadge && m.role === ROLE_MANAGER ? (
                    <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                      {tt("groupMgmt.roleManager")}
                    </span>
                  ) : null}
                </div>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    aria-label={tt("groupMgmt.removeAria")}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-error/10 hover:text-error"
                  >
                    ⊖
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
