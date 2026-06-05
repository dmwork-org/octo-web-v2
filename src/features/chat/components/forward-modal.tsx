import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type MessageContent,
  type Message,
} from "wukongimjssdk";
import { Search, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

type ForwardMode = "per" | "merge";

interface ForwardModalProps {
  open: boolean;
  messages: Message[];
  /** "per"=逐条转发 / "merge"=合并转发;由 selection-toolbar 两个按钮分别传入。 */
  defaultMode?: ForwardMode;
  onClose: () => void;
}

const CHANNEL_TYPE_THREAD = 5;

/**
 * 深克隆 MessageContent — 复用 src.content 多次 send 会让 WKSDK 把首次发送的
 * messageID / channel 写回原实例,后续重发被 server 视为重复或目标错乱
 * (实测"成功但接收方看不到"的根因)。
 *
 * **必须用 encode/decode(Uint8Array)而非 encodeJSON/decodeJSON** —
 * SDK MessageContent.encode 在 base class 把 mention/reply 元字段也拼进 wire
 * JSON,encodeJSON 只输出子类 content 字段,会让 @mention / 引用消息字段丢失。
 */
function cloneContent(src: MessageContent): MessageContent {
  const cloned = WKSDK.shared().getMessageContent(src.contentType);
  if (!cloned) return src;
  try {
    cloned.decode(src.encode());
  } catch {
    return src;
  }
  return cloned;
}

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
  c.msgs = sourceMessages;
  return c;
}

/** modal 关闭时重置内部 form state。 */
function useResetOnClose(open: boolean, reset: () => void): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (!open) resetRef.current();
  }, [open]);
}

/** 关键词 debounce 300ms(对齐老仓 useForwardModal.setInputValue)。 */
function useDebouncedKeyword(input: string, setKeyword: (k: string) => void) {
  useEffect(() => {
    const t = setTimeout(() => setKeyword(input), 300);
    return () => clearTimeout(t);
  }, [input, setKeyword]);
}

interface ForwardCandidate {
  channelID: string;
  channelType: number;
  channel: Channel;
  displayName: string;
  isAI: boolean;
  isExternal: boolean;
  isThread: boolean;
}

function conversationToCandidate(c: {
  channel: Channel;
  channelInfo?: { title?: string; orgData?: unknown };
}): ForwardCandidate {
  const info = c.channelInfo;
  const org = info?.orgData as
    | { displayName?: string; is_external_group?: number; robot?: number }
    | undefined;
  const name = org?.displayName || info?.title || c.channel.channelID;
  return {
    channelID: c.channel.channelID,
    channelType: c.channel.channelType,
    channel: c.channel,
    displayName: name,
    isAI: org?.robot === 1,
    isExternal: c.channel.channelType === ChannelTypeGroup && org?.is_external_group === 1,
    isThread: c.channel.channelType === CHANNEL_TYPE_THREAD,
  };
}

/**
 * 转发弹窗(1:1 对齐老仓 dmworkbase Components/ForwardModal):
 *
 * **UI**:固定 625×560 / header 居中标题 / 左右双列布局
 *   - 左 296px:搜索框(灰底胶囊,rounded-full 32h)+ 候选列表(checkbox + 28 头像 + 名字 + 外部 tag + AI)
 *   - 1px 分割线
 *   - 右 flex:"已选 N 人" + 已选列表(头像 + 名字 + X 移除按钮)
 *   - footer 右下:取消(白底)+ 确认(N)(黑底圆角)
 *
 * **行为**:
 *   - 关键词 debounce 300ms 过滤 displayName / channelID
 *   - 列表项点击 = 切换选中(同 checkbox)
 *   - 右栏 X = 移除该项
 *   - 确认 = 按 defaultMode 走 mergeforward 或 cloneContent(messages.length===1 强制 per)
 *
 * **跟老仓差异**(简化点):
 *   - 数据源只取 conversations(老仓还合并 friends + 搜索群组,后续 wave 再补)
 *   - 不显示 hasThreads/parentChannelID 嵌套(候选列表纯平铺)
 *   - 模式 toggle(per/merge)由 selection-toolbar 入口决定,modal 内不显
 */
export function ForwardModal({ open, messages, defaultMode = "per", onClose }: ForwardModalProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useResetOnClose(open, () => {
    setInput("");
    setKeyword("");
    setSelectedIds(new Set());
  });
  useDebouncedKeyword(input, setKeyword);

  const isMulti = messages.length > 1;
  const mode: ForwardMode = isMulti ? defaultMode : "per";

  const { data: conversations } = useQuery({
    ...conversationsQueryOptions(spaceId),
    enabled: open,
  });

  const allCandidates = useMemo<ForwardCandidate[]>(() => {
    return (conversations ?? [])
      .filter(
        (c) =>
          c.channel.channelType === ChannelTypeGroup ||
          c.channel.channelType === ChannelTypePerson ||
          c.channel.channelType === CHANNEL_TYPE_THREAD,
      )
      .map(conversationToCandidate);
  }, [conversations]);

  const filtered = useMemo<ForwardCandidate[]>(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return allCandidates;
    return allCandidates.filter(
      (c) => c.displayName.toLowerCase().includes(kw) || c.channelID.toLowerCase().includes(kw),
    );
  }, [allCandidates, keyword]);

  // 已选项 — 用 allCandidates 反查(保证已选项即使被搜索过滤也仍显示在右栏)
  const selectedCandidates = useMemo<ForwardCandidate[]>(() => {
    return allCandidates.filter((c) => selectedIds.has(c.channelID));
  }, [allCandidates, selectedIds]);

  const mu = useMutation({
    mutationFn: async () => {
      const targets = selectedCandidates.map((c) => c.channel);
      const chat = WKSDK.shared().chatManager;
      if (mode === "merge") {
        for (const target of targets) {
          const mf = buildMergeforward(messages);
          await chat.send(mf, target);
        }
      } else {
        for (const target of targets) {
          for (const m of messages) {
            await chat.send(cloneContent(m.content), target);
          }
        }
      }
    },
    onSuccess: () => {
      const modeLabel = isMulti ? (mode === "merge" ? "合并" : "逐条") : "";
      const summary = isMulti ? `${modeLabel}转发 ${messages.length} 条到` : "已转发到";
      toast.success(`${summary} ${selectedIds.size} 个会话`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "转发失败"),
  });

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const headerTitle = isMulti
    ? `${mode === "merge" ? "合并转发" : "逐条转发"} (${messages.length} 条)`
    : "转发";

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      // header 居中标题对齐老仓,无 X(close 通过 mask/取消按钮);
      // size=fit + className 固定 625×560(老仓 Figma 461:9093)
      size="fit"
      title={<span className="text-center text-[17px] font-semibold">{headerTitle}</span>}
      showCloseButton={false}
      className="h-[560px] w-[625px]"
      contentClassName="overflow-hidden p-0"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-[rgba(28,28,35,0.15)] bg-white px-4 text-[14px] text-[rgba(28,28,35,0.8)] transition-colors hover:bg-[rgba(28,28,35,0.04)]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => mu.mutate()}
            disabled={selectedIds.size === 0 || mu.isPending}
            className="inline-flex h-9 min-w-16 items-center justify-center rounded-full bg-[#1c1c23] px-4 text-[14px] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {mu.isPending ? "发送中…" : selectedIds.size > 0 ? `确认(${selectedIds.size})` : "确认"}
          </button>
        </div>
      }
    >
      {/* 左右两列(对齐老仓 .wk-fm-content) */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左列:搜索 + 候选列表(296px,对齐老仓 .wk-fm-left) */}
        <div className="flex w-[296px] shrink-0 flex-col overflow-hidden">
          {/* 灰底胶囊搜索框(对齐老仓 .wk-fm-search 32h F2F3F4 rounded-full) */}
          <div className="mx-2 mt-2 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-full bg-bg-elevated px-3">
            <Search size={14} className="shrink-0 text-[rgba(28,28,35,0.4)]" />
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="搜索"
              className="flex-1 border-0 bg-transparent text-[13px] text-text-primary placeholder:text-[rgba(28,28,35,0.35)] focus:outline-none"
            />
          </div>

          {/* 候选列表 */}
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
                {keyword ? "没有匹配的会话" : "暂无联系人"}
              </div>
            ) : (
              filtered.map((c) => {
                const checked = selectedIds.has(c.channelID);
                return (
                  <div
                    key={`${c.channelType}-${c.channelID}`}
                    onClick={() => toggle(c.channelID)}
                    className="flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]"
                  >
                    {/* checkbox(自定义,对齐老仓 <Checkbox>) */}
                    <span
                      role="checkbox"
                      aria-checked={checked}
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        checked
                          ? "border-brand bg-brand text-white"
                          : "border-border-default bg-bg-surface"
                      }`}
                    >
                      {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <div className="relative h-7 w-7 shrink-0">
                      <ChannelAvatar channel={c.channel} size={28} title={c.displayName} />
                    </div>
                    <span className="flex-1 truncate text-[14px] text-text-primary">
                      {c.displayName}
                    </span>
                    {c.isExternal ? (
                      <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-text-secondary">
                        外部
                      </span>
                    ) : null}
                    {c.isAI ? <AiBadge size="small" /> : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 1px 垂直分割线 */}
        <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

        {/* 右列:已选预览(对齐老仓 .wk-fm-right) */}
        <div className="flex flex-1 flex-col overflow-hidden py-2">
          {selectedCandidates.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
              未选择
            </div>
          ) : (
            <>
              <div className="shrink-0 px-2 pb-1.5 text-[12px] text-[rgba(28,28,35,0.4)]">
                已选 {selectedCandidates.length} 人
              </div>
              <div className="flex-1 overflow-y-auto">
                {selectedCandidates.map((c) => (
                  <div
                    key={`sel-${c.channelType}-${c.channelID}`}
                    className="group flex h-9 items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]"
                  >
                    <div className="relative h-7 w-7 shrink-0">
                      <ChannelAvatar channel={c.channel} size={28} title={c.displayName} />
                    </div>
                    <span className="flex-1 truncate text-[14px] text-text-primary">
                      {c.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(c.channelID);
                      }}
                      aria-label="移除"
                      className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.06)] hover:text-text-primary"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  );
}
