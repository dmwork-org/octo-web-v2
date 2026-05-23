import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { AlertCircle, MessageCircle, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { userDetailQueryKey, userDetailQueryOptions } from "@/features/base/queries/user.query";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { RealnameVerifiedBadge } from "@/features/base/components/badges/realname-verified-badge";
import { displayName, isRealnameVerified } from "@/features/base/lib/display-name";
import { FriendApplyModal } from "@/features/base/components/modals/friend-apply-modal";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { InputModal } from "@/features/base/components/modals/input-modal";
import { deleteFriend, setUserRemark } from "@/features/contacts/api/friends.api";
import { blacklistAdd, blacklistRemove } from "@/features/base/api/endpoints/blacklist.api";

interface UserInfoModalProps {
  uid: string | null;
  /** 搜索结果带来的 vercode(陌生人申请好友需要) */
  vercode?: string;
  onClose: () => void;
}

const APP_NAME = "Octo";
// UserRelation(对应旧 Service/Const)
const REL_FRIEND = 1;
const REL_BLACKLIST = 2;

/** Sections 内通用 row(对应旧 Sections+ListItem)。 */
function SectionRow({
  title,
  subTitle,
  danger,
  onClick,
}: {
  title: string;
  subTitle?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors ${
        clickable ? "hover:bg-bg-hover" : "cursor-default"
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

/**
 * 用户名片弹窗(对应旧 dmworkbase Components/UserInfo)。
 *
 * 头部:头像 + (displayName + AiBadge + RealnameVerifiedBadge) + ul(昵称 / Octo 号)
 *
 * **Sections 4 段**(对齐旧 module.tsx::registerUserInfo):
 *   1) userinfo.remark    设置备注(InputModal)+ 进群方式(P3 待接 subscriber)
 *   2) userinfo.others    解除好友 + 加/出黑名单(均 ConfirmModal,**仅外部成员**)
 *   3) userinfo.source    来源 — 外部成员显示 home_space_name,1v1 好友显示 source_desc
 *   4) userinfo.blacklist.tip  黑名单提示条
 *
 * 底部按钮 5 分支(F-1a 已对齐 UserInfo.getBottomPanel)。
 */
export function UserInfoModal({ uid, vercode, onClose }: UserInfoModalProps) {
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const myName = useStore(authStore, (s) => s.user?.name ?? s.user?.username ?? "");
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data, isLoading } = useQuery(userDetailQueryOptions(uid));
  const [friendApplyOpen, setFriendApplyOpen] = useState(false);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    action: "deleteFriend" | "blacklistAdd" | "blacklistRemove";
    content: string;
    title?: string;
  }>(null);

  const invalidate = () => {
    if (uid) void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid) });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
  };

  const remarkMu = useMutation({
    mutationFn: (remark: string) => setUserRemark(uid!, remark),
    onSuccess: () => {
      invalidate();
      toast.success("已保存");
      setRemarkOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "设置备注失败"),
  });

  const deleteFriendMu = useMutation({
    mutationFn: () => deleteFriend(uid!),
    onSuccess: () => {
      invalidate();
      toast.success("已删除好友");
      setConfirm(null);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除好友失败"),
  });

  const blacklistAddMu = useMutation({
    mutationFn: () => blacklistAdd(uid!),
    onSuccess: () => {
      invalidate();
      toast.success("已加入黑名单");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "加入黑名单失败"),
  });

  const blacklistRemoveMu = useMutation({
    mutationFn: () => blacklistRemove(uid!),
    onSuccess: () => {
      invalidate();
      toast.success("已移出黑名单");
      setConfirm(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "移出黑名单失败"),
  });

  if (!uid) return null;

  const channel = new Channel(uid, ChannelTypePerson);
  const display =
    displayName({
      name: data?.name,
      remark: data?.remark,
      real_name: data?.real_name,
      realname_verified: data?.realname_verified,
    }) || uid;

  const isSelf = uid === myUid;
  const isBot = data?.robot === 1;
  const isFriend = data?.follow === REL_FRIEND;
  const isBlacklisted = data?.status === REL_BLACKLIST;
  // 外部成员:home_space_id 与当前 Space 不一致(同 Space 时 home_space_id===currentSpaceId 或缺失)
  const isExternal =
    !!data?.home_space_id && !!currentSpaceId && data.home_space_id !== currentSpaceId;
  const hasVercode = !!(vercode || data?.vercode);
  const showRealname = isRealnameVerified({
    real_name: data?.real_name,
    realname_verified: data?.realname_verified,
  });
  const hasRemark = !!(data?.remark && data.remark !== "");

  const handleMessage = () => {
    chatSelectedActions.select(channel);
    onClose();
  };

  // 底部按钮 5 分支
  const renderBottom = () => {
    if (isSelf) return null;
    if (isExternal) {
      return (
        <div className="flex items-center justify-center px-6 py-3 text-xs text-text-tertiary">
          仅可在群内交流
        </div>
      );
    }
    if (currentSpaceId && (!isBot || isFriend)) {
      return (
        <Button type="primary" theme="solid" onClick={handleMessage}>
          <MessageCircle size={14} />
          发送消息
        </Button>
      );
    }
    if (isFriend) {
      return (
        <Button type="primary" theme="solid" onClick={handleMessage}>
          <MessageCircle size={14} />
          发送消息
        </Button>
      );
    }
    if (isBot) {
      return (
        <Button type="primary" theme="solid" onClick={() => setFriendApplyOpen(true)}>
          添加好友
        </Button>
      );
    }
    if (!hasVercode) return null;
    return (
      <Button type="secondary" theme="light" onClick={() => setFriendApplyOpen(true)}>
        添加好友
      </Button>
    );
  };

  const applyDefaultMessage = isBot ? `我想使用${display}` : `我是${myName}`;

  // ─── Sections ────────────────────────────────────────────

  const renderSections = () => {
    if (isSelf) return null;
    const sections: React.ReactNode[] = [];

    // Section 1 — userinfo.remark(非本人均显示)
    sections.push(
      <SectionGroup key="remark">
        <SectionRow title="设置备注" onClick={() => setRemarkOpen(true)} />
        {/* 进群方式:旧 fromSubscriberOfUser.orgData.created_at — P3 后续 wave 接群成员上下文 */}
      </SectionGroup>,
    );

    // Section 2 — userinfo.others(仅外部成员显示,避免误删同 Space 成员)
    if (isExternal) {
      sections.push(
        <SectionGroup key="others">
          {isFriend ? (
            <SectionRow
              title="解除好友关系"
              danger
              onClick={() =>
                setConfirm({
                  action: "deleteFriend",
                  content: `将联系人"${display}"删除,同时删除与该联系人的聊天记录`,
                })
              }
            />
          ) : null}
          {isBlacklisted ? (
            <SectionRow
              title="拉出黑名单"
              onClick={() =>
                setConfirm({
                  action: "blacklistRemove",
                  content: "将该联系人从黑名单中移出?",
                })
              }
            />
          ) : (
            <SectionRow
              title="拉入黑名单"
              danger
              onClick={() =>
                setConfirm({
                  action: "blacklistAdd",
                  content: "加入黑名单,你将不再收到对方的消息。",
                })
              }
            />
          )}
        </SectionGroup>,
      );
    }

    // Section 3 — userinfo.source
    if (isExternal && data?.source_space_name) {
      sections.push(
        <SectionGroup key="source">
          <SectionRow title="来源" subTitle={data.source_space_name} />
        </SectionGroup>,
      );
    } else if (!isExternal && isFriend && data?.source_desc) {
      sections.push(
        <SectionGroup key="source">
          <SectionRow title="来源" subTitle={data.source_desc} />
        </SectionGroup>,
      );
    }

    // Section 4 — userinfo.blacklist.tip
    if (isBlacklisted) {
      sections.push(
        <div
          key="blacklist-tip"
          className="mx-4 mb-2 flex items-center justify-center gap-1 rounded-md bg-error/10 px-4 py-2 text-[12px] text-error"
        >
          <AlertCircle size={12} />
          已添加至黑名单,你将不再收到对方的消息
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-end border-b border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
            加载中…
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
                  {hasRemark ? <li>昵称: {data?.name ?? "—"}</li> : null}
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
      </div>

      <FriendApplyModal
        open={friendApplyOpen}
        toUid={uid}
        vercode={vercode || data?.vercode}
        defaultMessage={applyDefaultMessage}
        title={isBot ? "申请添加好友" : "申请添加朋友"}
        onClose={() => setFriendApplyOpen(false)}
        onSuccess={() => {
          setFriendApplyOpen(false);
          onClose();
        }}
      />

      <InputModal
        open={remarkOpen}
        title="设置备注"
        placeholder="请输入备注"
        initialValue={data?.remark ?? ""}
        validate={() => true}
        okLoading={remarkMu.isPending}
        onOk={(value) => remarkMu.mutate(value)}
        onCancel={() => setRemarkOpen(false)}
      />

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        content={confirm?.content ?? ""}
        okDanger={confirm?.action !== "blacklistRemove"}
        okLoading={confirmLoading}
        onOk={onConfirmOk}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
