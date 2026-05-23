import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { userDetailQueryOptions } from "@/features/base/queries/user.query";

interface UserInfoModalProps {
  uid: string | null;
  onClose: () => void;
}

const SEX_LABELS: Record<number, string> = { 1: "男", 2: "女" };

/**
 * 用户名片弹窗(对应旧 dmworkbase Components/UserInfo)。
 *
 * - 顶部:头像 + name + short_no + 关闭
 * - 主体:备注(若有)+ 性别 + 简介 + 来源 Space(外部联系人)
 * - 底部:发消息按钮 → chatSelectedActions.select + onClose
 *
 * Wave 3 加:加好友(陌生人)/ 设备注 / @TA / 资料编辑(本人)。
 */
export function UserInfoModal({ uid, onClose }: UserInfoModalProps) {
  const { data, isLoading } = useQuery(userDetailQueryOptions(uid));

  if (!uid) return null;

  const channel = new Channel(uid, ChannelTypePerson);
  const display = data?.remark || data?.name || data?.username || uid;

  const handleMessage = () => {
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

        {isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">
            加载中…
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2 px-6 pt-2 pb-4">
              <ChannelAvatar channel={channel} size={64} title={display} />
              <h2 className="text-lg font-semibold text-text-primary">{display}</h2>
              {data?.short_no ? (
                <span className="font-mono text-xs text-text-tertiary">ID: {data.short_no}</span>
              ) : null}
            </div>

            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 border-t border-border-subtle px-6 py-4 text-xs">
              {data?.remark && data.remark !== data.name ? (
                <>
                  <dt className="text-text-tertiary">昵称</dt>
                  <dd className="text-text-primary">{data.name ?? "—"}</dd>
                </>
              ) : null}
              {typeof data?.sex === "number" && SEX_LABELS[data.sex] ? (
                <>
                  <dt className="text-text-tertiary">性别</dt>
                  <dd className="text-text-primary">{SEX_LABELS[data.sex]}</dd>
                </>
              ) : null}
              {data?.home_space_name ? (
                <>
                  <dt className="text-text-tertiary">来自</dt>
                  <dd className="text-text-primary">{data.home_space_name}</dd>
                </>
              ) : null}
              {data?.bio ? (
                <>
                  <dt className="text-text-tertiary">简介</dt>
                  <dd className="whitespace-pre-wrap text-text-primary">{data.bio}</dd>
                </>
              ) : null}
            </dl>

            <div className="flex shrink-0 items-center justify-center border-t border-border-subtle px-6 py-4">
              <Button type="primary" theme="solid" onClick={handleMessage}>
                <MessageCircle size={14} />
                发消息
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
