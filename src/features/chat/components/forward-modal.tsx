import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  ChannelTypeGroup,
  ChannelTypePerson,
  type Conversation,
  type Message,
} from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";

interface ForwardModalProps {
  open: boolean;
  message: Message;
  onClose: () => void;
}

/** ChannelType 7 = ChannelTypeCommunityTopic(子区);SDK 1.3.5 未导出常量,hardcode 7。 */
const CHANNEL_TYPE_THREAD = 7;

const TYPE_LABEL: Record<number, string> = {
  [ChannelTypePerson]: "私聊",
  [ChannelTypeGroup]: "群",
  [CHANNEL_TYPE_THREAD]: "子区",
};

/**
 * 转发弹窗(对应旧 dmworkbase Components/ForwardModal 精简版):
 *
 * - 多选当前 Space 的会话(从 conversationsQueryOptions 拿,包含群聊 / DM / 子区)
 * - 提交 → 遍历 selected → chatManager.send(message.content, target) batch
 * - SDK 自动触发 conv listener,目标会话 lastMessage 更新
 *
 * 旧版完整功能(留 P3+ wave):
 * - 联系人列表 friend tab
 * - 群聊补全(getMyGroups 合并去重)
 * - 搜索 debounce + group search API
 * - 输入留言文本(发送时附加一条文本消息)
 * - 懒加载 channelInfo VisibilityTrigger
 */
export function ForwardModal({ open, message, onClose }: ForwardModalProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: conversations } = useQuery({
    ...conversationsQueryOptions(spaceId),
    enabled: open,
  });

  const candidates = useMemo(() => {
    return (conversations ?? []).filter(
      (c) =>
        c.channel.channelType === ChannelTypeGroup ||
        c.channel.channelType === ChannelTypePerson ||
        c.channel.channelType === CHANNEL_TYPE_THREAD,
    );
  }, [conversations]);

  const mu = useMutation({
    mutationFn: async () => {
      const targets = candidates
        .filter((c) => selectedIds.has(c.channel.channelID))
        .map((c) => c.channel);
      const chat = WKSDK.shared().chatManager;
      for (const target of targets) {
        await chat.send(message.content, target);
      }
    },
    onSuccess: () => {
      toast.success(`已转发到 ${selectedIds.size} 个会话`);
      setSelectedIds(new Set());
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "转发失败"),
  });

  if (!open) return null;

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (selectedIds.size === 0 || mu.isPending) return;
    mu.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">分享给朋友</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <form onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 px-5 pt-3 pb-2 text-xs text-text-tertiary">
            已选 {selectedIds.size} 个
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
            {candidates.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">没有可选会话</div>
            ) : (
              candidates.map((c: Conversation) => {
                const id = c.channel.channelID;
                const checked = selectedIds.has(id);
                const name = c.channelInfo?.title ?? id;
                const typeLabel = TYPE_LABEL[c.channel.channelType] ?? "";
                return (
                  <label
                    key={`${c.channel.channelType}-${id}`}
                    className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-bg-hover ${
                      checked ? "bg-brand-tint" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(id)}
                      className="shrink-0"
                    />
                    <ChannelAvatar channel={c.channel} size={32} title={name} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {name}
                    </span>
                    {typeLabel ? (
                      <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                        {typeLabel}
                      </span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
            <Button type="tertiary" theme="borderless" onClick={onClose}>
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={selectedIds.size === 0}
            >
              发送
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
