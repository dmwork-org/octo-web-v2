import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Check, MessageCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { userDetailQueryOptions, userDetailQueryKey } from "@/features/base/queries/user.query";
import { applyFriend } from "@/features/contacts/api/friends.api";

interface BotDetailModalProps {
  uid: string | null;
  onClose: () => void;
}

/**
 * AI bot 名片弹窗(对应旧 dmworkbase Components/BotDetailModal):
 *
 * - 顶部:头像 + name + username + 关闭
 * - 主体:bot_description(优先) + 创建者 + commands(若有)
 * - 底部:
 *     - 已添加(follow=1): "发消息"按钮 → chatSelectedActions.select
 *     - 未添加: "添加"按钮 → POST /v1/friend/apply { to_uid, vercode } → invalidate
 *
 * 数据源跟 UserInfoModal 都是 GET /v1/users/{uid},响应中 bot_description /
 * bot_creator_name / bot_commands 是 robot=1 时才有的字段。
 */
export function BotDetailModal({ uid, onClose }: BotDetailModalProps) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(userDetailQueryOptions(uid));

  const applyMu = useMutation({
    mutationFn: () =>
      applyFriend({ to_uid: uid!, vercode: data?.vercode ?? "", remark: data?.name ?? "" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid!) });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("已发送添加请求");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "添加失败"),
  });

  if (!uid) return null;

  const channel = new Channel(uid, ChannelTypePerson);
  const display = data?.name || uid;
  const desc = data?.bot_description || data?.description || data?.bio || "暂无简介";
  const isFriend = data?.follow === 1;

  const handleMessage = () => {
    chatSelectedActions.select(channel);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
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
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">{display}</h2>
                <span className="rounded-sm bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">
                  AI
                </span>
              </div>
              {data?.username ? (
                <span className="font-mono text-xs text-text-tertiary">@{data.username}</span>
              ) : null}
            </div>

            <div className="border-t border-border-subtle px-6 py-4">
              <h3 className="mb-1 text-xs font-medium text-text-tertiary">简介</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">
                {desc}
              </p>
            </div>

            {data?.bot_creator_name || data?.bot_commands ? (
              <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 border-t border-border-subtle px-6 py-4 text-xs">
                {data?.bot_creator_name ? (
                  <>
                    <dt className="text-text-tertiary">创建者</dt>
                    <dd className="text-text-primary">{data.bot_creator_name}</dd>
                  </>
                ) : null}
                {data?.bot_commands ? (
                  <>
                    <dt className="text-text-tertiary">命令</dt>
                    <dd className="font-mono whitespace-pre-wrap text-text-primary">
                      {data.bot_commands}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border-subtle px-6 py-4">
              {isFriend ? (
                <>
                  <Button type="tertiary" theme="borderless" disabled>
                    <Check size={14} />
                    已添加
                  </Button>
                  <Button type="primary" theme="solid" onClick={handleMessage}>
                    <MessageCircle size={14} />
                    发消息
                  </Button>
                </>
              ) : (
                <Button
                  type="primary"
                  theme="solid"
                  loading={applyMu.isPending}
                  onClick={() => applyMu.mutate()}
                >
                  <Plus size={14} />
                  添加
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
