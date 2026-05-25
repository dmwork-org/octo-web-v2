import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { LogIn, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";

interface GroupCardModalProps {
  groupNo: string | null;
  /** 可选预填,接口慢时先显示;成功拿到 channelInfo 后覆盖。 */
  fallbackName?: string;
  fallbackMemberCount?: number;
  onClose: () => void;
}

/**
 * 群名片弹窗(对应旧 dmworkbase Components/GroupCard)。
 *
 * - 复用 SDK channelManager.fetchChannelInfo 触发缓存填充,然后 getChannelInfo 读
 *   (SDK fetchChannelInfo 返回 Promise<void>,info 在 channelInfoCallback 写进 cache)
 * - 头像 + 群名 + 成员数 + 进入群聊
 *
 * fetchChannelInfo + getChannelInfo 用命名 hook 包,满足 no-useeffect-in-component。
 */
function useGroupInfo(groupNo: string | null) {
  const [info, setInfo] = useState<{ name: string; memberCount: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!groupNo) {
      setInfo(null);
      return;
    }
    let stale = false;
    setLoading(true);
    const channel = new Channel(groupNo, ChannelTypeGroup);
    const mgr = WKSDK.shared().channelManager;
    mgr
      .fetchChannelInfo(channel)
      .then(() => {
        if (stale) return;
        const channelInfo = mgr.getChannelInfo(channel);
        const mc = (channelInfo?.orgData as { member_count?: number } | undefined)?.member_count;
        setInfo({
          name: channelInfo?.title ?? groupNo,
          memberCount: typeof mc === "number" ? mc : 0,
        });
        setLoading(false);
      })
      .catch(() => {
        if (stale) return;
        setInfo({ name: groupNo, memberCount: 0 });
        setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [groupNo]);

  return { info, loading };
}

export function GroupCardModal({
  groupNo,
  fallbackName,
  fallbackMemberCount,
  onClose,
}: GroupCardModalProps) {
  const { info, loading } = useGroupInfo(groupNo);

  if (!groupNo) return null;

  const channel = new Channel(groupNo, ChannelTypeGroup);
  const name = info?.name ?? fallbackName ?? groupNo;
  const memberCount = info?.memberCount ?? fallbackMemberCount ?? 0;

  const handleEnter = () => {
    chatSelectedActions.select(channel);
    onClose();
  };

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

        {loading && !info ? (
          <div className="flex h-48 items-center justify-center text-sm text-text-tertiary">
            加载中…
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-4">
              <ChannelAvatar channel={channel} size={56} title={name} />
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">{name}</h2>
                <span className="rounded-sm bg-bg-elevated px-1.5 text-[10px] font-semibold text-text-tertiary">
                  群
                </span>
              </div>
              {memberCount > 0 ? (
                <span className="text-xs text-text-tertiary">{memberCount} 位成员</span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-center border-t border-border-subtle px-6 py-4">
              <Button type="primary" theme="solid" onClick={handleEnter}>
                <LogIn size={14} />
                进入群聊
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
