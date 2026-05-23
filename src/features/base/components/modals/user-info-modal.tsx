import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { userDetailQueryOptions } from "@/features/base/queries/user.query";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { RealnameVerifiedBadge } from "@/features/base/components/badges/realname-verified-badge";
import { displayName, isRealnameVerified } from "@/features/base/lib/display-name";
import { FriendApplyModal } from "@/features/base/components/modals/friend-apply-modal";

interface UserInfoModalProps {
  uid: string | null;
  /** 搜索结果带来的 vercode(陌生人申请好友需要) */
  vercode?: string;
  onClose: () => void;
}

const APP_NAME = "Octo";

/**
 * 用户名片弹窗(对应旧 dmworkbase Components/UserInfo)。
 *
 * 头部(旧 .wk-userinfo-header):
 *   头像 + (displayName + AiBadge + RealnameVerifiedBadge)
 *   ul:[ 昵称 (有备注时显示原始 name)
 *       群昵称 (P3 后续 wave 接 fromSubscriberOfUser 后再加)
 *       OCTO 号: {short_no} (有时显示) ]
 *
 * Sections(旧 4 段:remark/others/source/blacklist.tip)P3 F-1b 接入。
 *
 * 底部按钮 5 分支(对齐 UserInfo.getBottomPanel):
 *   1) 本人:隐藏
 *   2) 外部成员(跨 Space):"仅可在群内交流" 提示
 *   3) 在 Space 内非 Bot OR 已加好友:发送消息
 *   4) Bot 未加:添加好友(申请文案"我想使用{display}")
 *   5) 陌生人有 vercode:添加好友(申请文案"我是{myName}")
 *   6) 陌生人无 vercode:不显示按钮
 */
export function UserInfoModal({ uid, vercode, onClose }: UserInfoModalProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const myName = useStore(authStore, (s) => s.user?.name ?? s.user?.username ?? "");
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data, isLoading } = useQuery(userDetailQueryOptions(uid));
  const [friendApplyOpen, setFriendApplyOpen] = useState(false);

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
  const isFriend = data?.follow === 1;
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
    // Space 内 非 Bot OR Bot 已加 → 发消息
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

  // 申请文案(对齐旧 getBottomPanel):
  // - Bot 未加:"我想使用{display}"
  // - 陌生人:"我是{myDisplayName}"
  const applyDefaultMessage = isBot ? `我想使用${display}` : `我是${myName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
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
            <div className="flex items-start gap-4 px-6 pt-2 pb-4">
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

            {/* P3 F-1b 接入 Sections 4 段(remark / others / source / blacklist.tip) */}

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
    </div>
  );
}
