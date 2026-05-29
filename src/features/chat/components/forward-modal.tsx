import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  MessageText,
  type Conversation,
  type Message,
} from "wukongimjssdk";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import {
  MergeforwardContent,
  type MergeforwardInnerMsg,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";

interface ForwardModalProps {
  open: boolean;
  /** 单条 message 也可以传 [message],对齐多选数组形态。 */
  messages: Message[];
  onClose: () => void;
}

/** ChannelType 5 = ChannelTypeCommunityTopic(子区);对齐旧 dmworkbase Const.ts。 */
const CHANNEL_TYPE_THREAD = 5;

const TYPE_LABEL: Record<number, string> = {
  [ChannelTypePerson]: "私聊",
  [ChannelTypeGroup]: "群",
  [CHANNEL_TYPE_THREAD]: "子区",
};

type ForwardMode = "per" | "merge";

/**
 * Build MergeforwardContent from selected messages(对齐旧 vm.ts:555 sendMergeforward):
 * - channelType = 源 channel.channelType(取第一个 message)
 * - users = msgs.fromUID 去重 + WKSDK channelInfo title
 * - msgs = raw inner payload(message_id / from_uid / timestamp / payload contentObj)
 *
 * 注意 inner payload 需要 type 字段(后端 / 接收方按 type 选 renderer):用
 * `{ ...encodeJSON(), type: contentType }` 拼回。content.contentObj 可能是 raw
 * 解码缓存,优先用它(对齐旧 messageToMap)。
 */
function buildMergeforward(sourceMessages: Message[]): MergeforwardContent {
  const c = new MergeforwardContent();
  c.channelType = sourceMessages[0]?.channel.channelType ?? 0;
  const seen = new Set<string>();
  const users: MergeforwardUser[] = [];
  for (const m of sourceMessages) {
    if (!m.fromUID || seen.has(m.fromUID)) continue;
    seen.add(m.fromUID);
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(m.fromUID, ChannelTypePerson),
    );
    users.push({ uid: m.fromUID, name: info?.title || m.fromUID });
  }
  c.users = users;
  c.msgs = sourceMessages.map((m): MergeforwardInnerMsg => {
    const contentObj = (m.content as { contentObj?: Record<string, unknown> }).contentObj;
    const json = contentObj
      ? { ...contentObj, type: m.contentType }
      : { ...m.content.encodeJSON(), type: m.contentType };
    return {
      message_id: m.messageID,
      from_uid: m.fromUID,
      timestamp: m.timestamp,
      payload: json as MergeforwardInnerMsg["payload"],
    };
  });
  return c;
}

/**
 * 转发弹窗(对应旧 dmworkbase Components/ForwardModal):
 *
 * - 多选当前 Space 的会话(从 conversationsQueryOptions 拿,包含群聊 / DM / 子区)
 * - 模式 toggle:多于 1 条消息时显示「逐条 / 合并」单选,默认合并
 *   - 逐条:对每个 target 顺序 send 全部 messages
 *   - 合并:对每个 target send 1 条 MergeforwardContent(对齐旧 vm.ts sendMergeforward)
 * - 底部 textarea 可选留言(模式无关,作为额外 MessageText 发)
 *
 * 旧 ForwardModal 完整版 UI(左右两列)留 P4+ — 本期先聚焦模式选择 + 真合并构造。
 */
export function ForwardModal({ open, messages, onClose }: ForwardModalProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [leaveMessage, setLeaveMessage] = useState("");
  const [mode, setMode] = useState<ForwardMode>("merge");
  const isMulti = messages.length > 1;

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
      const note = leaveMessage.trim();
      if (isMulti && mode === "merge") {
        // 合并:每个 target 发 1 条 MergeforwardContent
        for (const target of targets) {
          const mf = buildMergeforward(messages);
          await chat.send(mf, target);
          if (note) await chat.send(new MessageText(note), target);
        }
      } else {
        // 逐条:每个 target 顺序 send 全部 messages
        for (const target of targets) {
          for (const m of messages) {
            await chat.send(m.content, target);
          }
          if (note) await chat.send(new MessageText(note), target);
        }
      }
    },
    onSuccess: () => {
      const noteSent = leaveMessage.trim().length > 0;
      const modeLabel = isMulti ? (mode === "merge" ? "合并" : "逐条") : "";
      const summary = isMulti ? `${modeLabel}转发 ${messages.length} 条消息到` : "已转发到";
      toast.success(`${summary} ${selectedIds.size} 个会话${noteSent ? "(附带留言)" : ""}`);
      setSelectedIds(new Set());
      setLeaveMessage("");
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
          <h2 className="text-sm font-semibold text-text-primary">
            {isMulti ? `转发 ${messages.length} 条消息` : "分享给朋友"}
          </h2>
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
          {isMulti ? (
            <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-bg-elevated px-5 py-2">
              <span className="text-xs text-text-secondary">转发方式</span>
              <div className="flex items-center gap-1 rounded-md bg-bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("merge")}
                  className={`rounded px-3 py-1 text-xs transition-colors ${
                    mode === "merge"
                      ? "bg-bg-elevated text-text-primary font-medium"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  合并转发
                </button>
                <button
                  type="button"
                  onClick={() => setMode("per")}
                  className={`rounded px-3 py-1 text-xs transition-colors ${
                    mode === "per"
                      ? "bg-bg-elevated text-text-primary font-medium"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  逐条转发
                </button>
              </div>
            </div>
          ) : null}

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

          <div className="shrink-0 border-t border-border-subtle px-5 py-3">
            <textarea
              value={leaveMessage}
              onChange={(e) => setLeaveMessage(e.target.value.slice(0, 500))}
              rows={2}
              placeholder="留言(可选,会作为一条独立消息发送)"
              className="w-full resize-none rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
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
