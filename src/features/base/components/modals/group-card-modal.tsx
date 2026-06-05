import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { LogIn } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

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
 * 浮动元素壳层统一规范 Phase C — 走 BaseDialog,免费获得 focus trap / Esc /
 * scroll lock / aria / portal。
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
  const channel = groupNo ? new Channel(groupNo, ChannelTypeGroup) : null;
  const name = info?.name ?? fallbackName ?? groupNo ?? "";
  const memberCount = info?.memberCount ?? fallbackMemberCount ?? 0;

  const handleEnter = () => {
    if (!channel) return;
    chatSelectedActions.select(channel);
    onClose();
  };

  return (
    <BaseDialog
      open={!!groupNo}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="sm"
      // a11y:无可见 title 时用 sr-only description 兜底 Radix 要求
      description={name ? `${name} 群名片` : "群名片"}
      contentClassName="overflow-visible"
    >
      {loading && !info ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-tertiary">
          加载中…
        </div>
      ) : channel ? (
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
      ) : null}
    </BaseDialog>
  );
}
