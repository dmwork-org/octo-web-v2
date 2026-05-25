import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { matterDetailQueryKey } from "@/features/matter/queries/matters.query";
import { linkChannel, unlinkChannel } from "@/features/matter/api/matter.api";

/** ChannelType 7 = ChannelTypeCommunityTopic(子区),SDK 未导出常量 */
const CHANNEL_TYPE_THREAD = 7;

const TYPE_LABEL: Record<number, string> = {
  [ChannelTypePerson]: "私聊",
  [ChannelTypeGroup]: "群",
  [CHANNEL_TYPE_THREAD]: "子区",
};

interface ChannelPickerProps {
  open: boolean;
  matterId: string;
  /** 当前 matter 已关联 channel_id 集合(用于预填 + diff) */
  currentChannelIds: string[];
  onClose: () => void;
}

/** open 翻转时 reset 选中集合到 current(命名 hook 包 useEffect)。 */
function useResetSelectionOnOpen(
  open: boolean,
  currentIds: string[],
  setSelected: (s: Set<string>) => void,
) {
  useEffect(() => {
    if (open) setSelected(new Set(currentIds));
  }, [open, currentIds, setSelected]);
}

/**
 * Matter 关联会话选择器(对应旧 dmworktodo LinkChannelsModal 精简版):
 *
 * - 候选 = 当前 Space conversations(群 / 私聊 / 子区,从 conversationsQueryOptions)
 * - 预填当前 channelIds,提交 diff 出需要 link / unlink 的 channel,batch 并发
 * - 成功 invalidate matter detail
 *
 * 旧版还有搜索 / 群补全(getMyGroups merge)/ 历史会话记忆,P3+ wave 后续接。
 */
export function ChannelPicker({ open, matterId, currentChannelIds, onClose }: ChannelPickerProps) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentChannelIds));
  useResetSelectionOnOpen(open, currentChannelIds, setSelected);

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
      const current = new Set(currentChannelIds);
      const toAdd = candidates.filter(
        (c) => selected.has(c.channel.channelID) && !current.has(c.channel.channelID),
      );
      const toRemove = [...current].filter((id) => !selected.has(id));
      await Promise.all([
        ...toAdd.map((c) =>
          linkChannel(matterId, {
            channel_id: c.channel.channelID,
            channel_type: c.channel.channelType,
            channel_name: c.channelInfo?.title,
          }),
        ),
        ...toRemove.map((id) => unlinkChannel(matterId, id)),
      ]);
      return { added: toAdd.length, removed: toRemove.length };
    },
    onSuccess: ({ added, removed }) => {
      void qc.invalidateQueries({ queryKey: ["matter", "list"] });
      void qc.invalidateQueries({ queryKey: matterDetailQueryKey(matterId) });
      const parts: string[] = [];
      if (added) parts.push(`新增 ${added}`);
      if (removed) parts.push(`移除 ${removed}`);
      toast.success(parts.length ? `已${parts.join(" / ")}` : "未变更");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mu.isPending) return;
    mu.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">关联会话</h2>
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
            已选 {selected.size} 个
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
            {candidates.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-text-tertiary">没有可选会话</div>
            ) : (
              candidates.map((c: Conversation) => {
                const id = c.channel.channelID;
                const checked = selected.has(id);
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
            <Button htmlType="submit" type="primary" theme="solid" loading={mu.isPending}>
              保存
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
