import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Subscriber } from "wukongimjssdk";
import { ArrowLeft, Search, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useDrawerEnterTransition } from "@/features/chat/hooks/use-drawer-enter-transition.hook";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import {
  addGroupManagers,
  removeGroupBotAdmin,
  removeGroupManagers,
  setGroupBotAdmin,
} from "@/features/base/api/endpoints/group.api";

interface GroupManagementModalProps {
  open: boolean;
  channel: Channel;
  /** owner=1 / manager=2 / 其他=只读。本组件需要 isOwner 才能加/删管理员;manager 只能看。 */
  isOwner: boolean;
  onClose: () => void;
}

const ROLE_OWNER = 1;
const ROLE_MANAGER = 2;

type Mode = "view" | "addManager" | "addBotAdmin";

/**
 * 群管理二级抽屉(对应旧 dmworkbase GroupManagement):
 *
 *   ┌ Header(← + 群管理)
 *   ├ Section A: 群主、管理员
 *   │   - 列表(owner + manager)
 *   │   - [ 添加管理员 ](isOwner;打开候选 normal 成员列表)
 *   │   - 每行 ⊖ 移除管理员(isOwner only)
 *   └ Section B: Bot 管理员
 *       - 列表(robot && bot_admin===1)
 *       - [ 添加 Bot 管理员 ](isOwner;打开候选 bot 成员列表)
 *       - 每行 ⊖ 移除(isOwner only)
 *
 * 添加流程:点添加按钮 → 整个 modal 内容切换到 candidate list view(mode 切换),
 * 多选/单选 + 完成 → 提交 → 切回 view。
 */
export function GroupManagementModal({
  open,
  channel,
  isOwner,
  onClose,
}: GroupManagementModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const entered = useDrawerEnterTransition(open);
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

  // 候选列表(过滤 + 搜索)
  const candidatePool = useMemo(() => {
    if (mode === "addManager") {
      // 普通成员(role===0)且非自己
      return subscribers.filter((s) => {
        const og = s.orgData as { robot?: number } | undefined;
        return s.uid !== myUid && og?.robot !== 1 && (s.role ?? 0) === 0;
      });
    }
    if (mode === "addBotAdmin") {
      // robot 且尚未是 bot admin
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

  const exitAddMode = () => {
    setMode("view");
    setPickedUids([]);
    setKeyword("");
  };

  const promoteMu = useMutation({
    mutationFn: (uids: string[]) => addGroupManagers(channel.channelID, uids),
    onSuccess: () => {
      refreshSubs();
      toast.success("已添加管理员");
      exitAddMode();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "添加失败"),
  });

  const demoteMu = useMutation({
    mutationFn: (uid: string) => removeGroupManagers(channel.channelID, [uid]),
    onSuccess: () => {
      refreshSubs();
      toast.success("已移除管理员");
      setConfirmRemove(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "移除失败"),
  });

  const setBotAdminMu = useMutation({
    mutationFn: (uid: string) => setGroupBotAdmin(channel.channelID, uid),
    onSuccess: () => {
      refreshSubs();
      toast.success("已添加 Bot 管理员");
      exitAddMode();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "添加失败"),
  });

  const removeBotAdminMu = useMutation({
    mutationFn: (uid: string) => removeGroupBotAdmin(channel.channelID, uid),
    onSuccess: () => {
      refreshSubs();
      toast.success("已移除 Bot 管理员");
      setConfirmRemove(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "移除失败"),
  });

  if (!open) return null;

  const togglePick = (uid: string) => {
    if (mode === "addBotAdmin") {
      // bot admin 单选(后端一次一个 uid)
      setPickedUids(pickedUids[0] === uid ? [] : [uid]);
      return;
    }
    setPickedUids((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const onFinishPick = () => {
    if (pickedUids.length === 0) {
      toast.warning("请选择成员");
      return;
    }
    if (mode === "addManager") {
      promoteMu.mutate(pickedUids);
    } else if (mode === "addBotAdmin") {
      setBotAdminMu.mutate(pickedUids[0]);
    }
  };

  const inAddMode = mode !== "view";
  const addModeTitle = mode === "addManager" ? "添加管理员" : "添加 Bot 管理员";
  const onHeaderBack = inAddMode ? exitAddMode : onClose;
  const headerTitle = inAddMode ? addModeTitle : "群管理";

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-md transform flex-col overflow-hidden border-l border-border-default bg-bg-surface shadow-xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onHeaderBack}
            aria-label={inAddMode ? "返回群管理" : "关闭"}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            {inAddMode ? <ArrowLeft size={16} /> : <X size={16} />}
          </button>
          <h2 className="flex-1 text-sm font-semibold text-text-primary">{headerTitle}</h2>
          {inAddMode ? (
            <Button
              type="primary"
              theme="solid"
              size="small"
              loading={promoteMu.isPending || setBotAdminMu.isPending}
              disabled={pickedUids.length === 0}
              onClick={onFinishPick}
            >
              完成{pickedUids.length > 0 ? `(${pickedUids.length})` : ""}
            </Button>
          ) : null}
        </header>

        {inAddMode ? (
          <>
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
              {filteredPool.length === 0 ? (
                <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                  {keyword ? "没有匹配的成员" : "暂无可选成员"}
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
              title="群主、管理员"
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
              addLabel="添加管理员"
              showRoleBadge
            />
            <ManagerSection
              title="Bot 管理员"
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
              addLabel="添加 Bot 管理员"
              emptyText="暂无 Bot 管理员"
            />
          </div>
        )}
      </aside>

      {confirmRemove ? (
        <ConfirmModal
          open
          title={confirmRemove.kind === "manager" ? "移除管理员" : "移除 Bot 管理员"}
          content={`确定将 ${confirmRemove.name} 移除${
            confirmRemove.kind === "manager" ? "管理员" : "Bot 管理员"
          }吗?`}
          okText="移除"
          okDanger
          okLoading={demoteMu.isPending || removeBotAdminMu.isPending}
          onOk={() => {
            if (confirmRemove.kind === "manager") demoteMu.mutate(confirmRemove.uid);
            else removeBotAdminMu.mutate(confirmRemove.uid);
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
    </div>
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
  return (
    <section className="mx-4 mb-3 flex flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-base">
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
          {emptyText ?? "暂无"}
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
                      群主
                    </span>
                  ) : showRoleBadge && m.role === ROLE_MANAGER ? (
                    <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-semibold text-brand">
                      管理员
                    </span>
                  ) : null}
                </div>
                {canRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    aria-label="移除"
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
