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
import { ChannelMembersModal } from "@/features/chat/components/channel-members-modal";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import {
  addGroupManagers,
  removeGroupBotAdmin,
  removeGroupManagers,
  setGroupBotAdmin,
  transferGroupOwner,
} from "@/features/base/api/endpoints/group.api";
import { setChannelAllowNoMention } from "@/features/base/api/endpoints/channel-setting.api";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import { ToggleRow } from "@/features/base/components/section-form/toggle-row";
import { NavRow } from "@/features/base/components/section-form/nav-row";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { submitBotAdmins } from "@/features/chat/lib/incoming-webhook";

interface GroupManagementModalProps {
  open: boolean;
  channel: Channel;
  /** 群 channelInfo,用于读 orgData.allow_no_mention 等设置态(可选,缺省时 toggle 走默认值)。 */
  channelInfo?: ChannelInfo;
  /** owner=1 时可加/删管理员;manager 只能管理 Bot 管理员和群级开关。 */
  isOwner: boolean;
  /** owner 或 manager 都可控制群级 toggle(allow-no-mention 等);只读用户不显示 toggle section。 */
  canManage: boolean;
  onClose: () => void;
}

const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

type Mode = "view" | "addManager" | "addBotAdmin" | "transferOwner";

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
  const [confirmTransfer, setConfirmTransfer] = useState<Subscriber | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
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
    if (mode === "transferOwner") {
      return subscribers.filter((s) => {
        const og = s.orgData as { robot?: number } | undefined;
        return s.uid !== myUid && og?.robot !== 1;
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
    mutationFn: (uids: string[]) =>
      submitBotAdmins(uids, (uid) => setGroupBotAdmin(channel.channelID, uid)),
    onSuccess: (result, uids) => {
      if (result.succeeded.length > 0) {
        refreshSubs();
        exitAddMode();
      }
      if (result.failed.length === 0) {
        toast.success(t("groupMgmt.toast.botAdminAdded"));
        return;
      }
      if (result.succeeded.length === 0) {
        toast.error(t("groupMgmt.toast.addFailed"));
        return;
      }
      toast.error(
        t("groupMgmt.toast.botAdminPartialFailed", {
          values: {
            failed: result.failed.length,
            total: uids.length,
            uids: result.failed.map((f) => f.uid).join(", "),
          },
        }),
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.addFailed")),
  });

  const transferOwnerMu = useMutation({
    mutationFn: (uid: string) => transferGroupOwner(channel.channelID, uid),
    onSuccess: () => {
      refreshSubs();
      refreshChannelInfo();
      toast.success(t("groupMgmt.toast.ownerTransferred"));
      setConfirmTransfer(null);
      exitAddMode();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMgmt.toast.transferOwnerFailed")),
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
    if (mode === "transferOwner") {
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
      setBotAdminMu.mutate([...pickedUids]);
    } else if (mode === "transferOwner") {
      const selected = subscribers.find((s) => s.uid === pickedUids[0]);
      if (selected) setConfirmTransfer(selected);
    }
  };

  const inAddMode = mode !== "view";
  const addModeTitle =
    mode === "addManager"
      ? tt("groupMgmt.addManagerTitle")
      : mode === "addBotAdmin"
        ? tt("groupMgmt.addBotAdminTitle")
        : tt("groupMgmt.transferOwnerSelect");
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
                loading={
                  promoteMu.isPending || setBotAdminMu.isPending || transferOwnerMu.isPending
                }
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
              canEdit={isOwner}
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
            {isOwner ? (
              <SectionGroup>
                <NavRow
                  title={tt("groupMgmt.transferOwner")}
                  subTitle={tt("groupMgmt.transferOwnerHint")}
                  onClick={() => setMode("transferOwner")}
                />
              </SectionGroup>
            ) : null}
            <ManagerSection
              title={tt("groupMgmt.botAdmins")}
              members={botAdmins}
              canEdit={canManage}
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
              <SectionGroup>
                <NavRow
                  title={tt("groupMgmt.memberManagement")}
                  subTitle={tt("groupMgmt.memberManagementHint", {
                    values: { count: subscribers.length },
                  })}
                  onClick={() => setMembersOpen(true)}
                />
                <ToggleRow
                  title={tt("groupMgmt.allowNoMention")}
                  checked={allowNoMention}
                  loading={allowNoMentionMu.isPending}
                  onChange={(v) => allowNoMentionMu.mutate(v)}
                />
              </SectionGroup>
            ) : null}
          </div>
        )}
      </BaseDrawer>

      <ChannelMembersModal
        open={membersOpen}
        channel={channel}
        onClose={() => setMembersOpen(false)}
      />

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

      {confirmTransfer ? (
        <ConfirmModal
          open
          title={tt("groupMgmt.transferOwner")}
          content={tt("groupMgmt.transferOwnerConfirm", {
            values: {
              name: confirmTransfer.remark || confirmTransfer.name || confirmTransfer.uid,
            },
          })}
          okText={tt("groupMgmt.transferOwner")}
          okLoading={transferOwnerMu.isPending}
          onOk={() => transferOwnerMu.mutate(confirmTransfer.uid)}
          onCancel={() => setConfirmTransfer(null)}
        />
      ) : null}
    </>
  );
}

function ManagerSection({
  title,
  members,
  canEdit,
  onAdd,
  onRemove,
  addLabel,
  emptyText,
  showRoleBadge,
}: {
  title: string;
  members: Subscriber[];
  canEdit: boolean;
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
        {canEdit ? (
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
            const canRemove = canEdit && (showRoleBadge ? m.role === ROLE_MANAGER : true);
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
