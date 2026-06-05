import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Conversation,
  type MessageContent,
  type Message,
} from "wukongimjssdk";
import { Check, Search, X } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
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
  /** 仅关闭(取消 / mask / Esc)— 不应清多选,对齐老仓行为:关闭 modal 多选仍在。 */
  onClose: () => void;
  /** 转发成功后回调 — 上层用来 exit 多选 + 清状态。 */
  onSuccess?: () => void;
}

const CHANNEL_TYPE_THREAD = 5;
const TOP_BOOST = 1_000_000;

/**
 * 深克隆 MessageContent — 复用 src.content 多次 send 会让 WKSDK 把首次发送的
 * messageID / channel 写回原实例,后续重发被 server 视为重复或目标错乱
 * (实测"成功但接收方看不到"的根因)。
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

function useResetOnClose(open: boolean, reset: () => void): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;
  useEffect(() => {
    if (!open) resetRef.current();
  }, [open]);
}

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
  /** 子区父群 ID:有值时列表项缩进 36px(对齐老仓 wk-fm-item--child) */
  parentChannelID?: string;
}

function conversationToCandidate(c: Conversation, parentChannelID?: string): ForwardCandidate {
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
    parentChannelID,
  };
}

/**
 * 按 timestamp + top boost 排序(对齐老仓 useForwardModal sortConversations:
 * 置顶 +1_000_000,然后 desc by timestamp)。
 */
function sortByTimestampTopBoost(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    let aScore = a.timestamp ?? 0;
    let bScore = b.timestamp ?? 0;
    if (a.channelInfo?.top) aScore += TOP_BOOST;
    if (b.channelInfo?.top) bScore += TOP_BOOST;
    return bScore - aScore;
  });
}

/**
 * 重排:按 timestamp 排序后,把子区 (THREAD) 挂在父群下一行,孤儿子区追加末尾
 * (对齐老仓 useForwardModal rebuildConvItems L150-176)。
 */
function orderConversationsWithThreads(conversations: Conversation[]): ForwardCandidate[] {
  const visible = conversations.filter(
    (c) =>
      c.channel.channelType === ChannelTypeGroup ||
      c.channel.channelType === ChannelTypePerson ||
      c.channel.channelType === CHANNEL_TYPE_THREAD,
  );
  const sorted = sortByTimestampTopBoost(visible);

  const groupAndDm: Conversation[] = [];
  const threads: Conversation[] = [];
  for (const c of sorted) {
    if (c.channel.channelType === CHANNEL_TYPE_THREAD) threads.push(c);
    else groupAndDm.push(c);
  }

  // 按 parentGroupNo 分桶(优先 orgData.parentGroupNo,fallback parseThreadChannelId)
  const threadsByParent = new Map<string, Conversation[]>();
  const orphanThreads: Conversation[] = [];
  for (const tw of threads) {
    const orgParent = (tw.channelInfo?.orgData as { parentGroupNo?: string } | undefined)
      ?.parentGroupNo;
    const parent =
      (orgParent != null ? String(orgParent) : undefined) ??
      parseThreadChannelId(tw.channel.channelID)?.groupNo;
    if (parent) {
      const arr = threadsByParent.get(parent) ?? [];
      arr.push(tw);
      threadsByParent.set(parent, arr);
    } else {
      orphanThreads.push(tw);
    }
  }

  // 输出顺序:父群 → 其子区(紧跟) → 下一父群 → 孤儿子区尾
  const out: ForwardCandidate[] = [];
  for (const gw of groupAndDm) {
    out.push(conversationToCandidate(gw));
    if (gw.channel.channelType === ChannelTypeGroup) {
      const children = threadsByParent.get(gw.channel.channelID) ?? [];
      for (const tw of children) {
        out.push(conversationToCandidate(tw, gw.channel.channelID));
      }
    }
  }
  for (const ow of orphanThreads) {
    out.push(conversationToCandidate(ow));
  }
  return out;
}

/**
 * 转发弹窗(1:1 对齐老仓 dmworkbase Components/ForwardModal + useForwardModal):
 *
 * **UI**(老仓 Figma 461:9093):625×560 / header 居中 17px 600w 无 X / 左右双列
 *   - 左 296px:搜索框(灰胶囊 32h)+ 候选(方形 checkbox + 28 头像 + 名字 + 外部 + AI)
 *   - 1px 分割线
 *   - 右 flex:已选预览 + X 移除
 *   - footer 右下:取消(白圆角)+ 确认(N)(黑圆角)
 *
 * **数据源**:conversations(按 timestamp + top boost 排,父群下嵌套子区缩进 36px)
 *   + spaceMembers(全员,过滤自己 / robot / 已在 conversations 的 uid)— 对齐老仓
 *   "最近会话 + 全部加入群 + 好友"三源合并(本期 spaceMembers 替代后两源)
 *
 * **过滤**(命中子区带出父群,对齐老仓 useForwardModal filtered 计算):
 *   - 命中项进 includeIDs
 *   - 命中子区且其 parentChannelID 未被命中 → 父群一起带出
 *   - 保持树形顺序(遍历 allCandidates 按 order 过滤)
 *
 * **模式**:defaultMode 由 selection-toolbar 入口传(per/merge),modal 内不显 toggle。
 */
export function ForwardModal({
  open,
  messages,
  defaultMode = "per",
  onClose,
  onSuccess,
}: ForwardModalProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
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

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  /**
   * 全量候选 = 会话(已 timestamp+top 排序 + 父群下嵌套子区) + spaceMembers(去自己/robot/
   * 已在会话的 uid),保留出现顺序(会话在前,好友在后)。
   */
  const allCandidates = useMemo<ForwardCandidate[]>(() => {
    const fromConvs = orderConversationsWithThreads(conversations ?? []);
    const convDmIds = new Set(
      fromConvs.filter((c) => c.channelType === ChannelTypePerson).map((c) => c.channelID),
    );
    const fromMembers: ForwardCandidate[] = (members ?? [])
      .filter((m) => m.uid !== myUid && m.robot !== 1 && !convDmIds.has(m.uid))
      .map((m) => {
        const channel = new Channel(m.uid, ChannelTypePerson);
        return {
          channelID: m.uid,
          channelType: ChannelTypePerson,
          channel,
          displayName: m.name || m.uid,
          isAI: false,
          isExternal: false,
          isThread: false,
        };
      });
    return [...fromConvs, ...fromMembers];
  }, [conversations, members, myUid]);

  /**
   * 过滤命中 + 命中子区带出父群,保持树形顺序(对齐老仓 useForwardModal L298-318)。
   */
  const filtered = useMemo<ForwardCandidate[]>(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return allCandidates;
    const matched = allCandidates.filter(
      (c) => c.displayName.toLowerCase().includes(kw) || c.channelID.toLowerCase().includes(kw),
    );
    const parentIDsToInclude = new Set<string>();
    for (const c of matched) {
      if (c.parentChannelID) parentIDsToInclude.add(c.parentChannelID);
    }
    const matchedIDs = new Set(matched.map((c) => c.channelID));
    const includeIDs = new Set([...matchedIDs, ...parentIDsToInclude]);
    // 保持原顺序(allCandidates 已按 父群→子区 排好)
    return allCandidates.filter((c) => includeIDs.has(c.channelID));
  }, [allCandidates, keyword]);

  // 已选用 allCandidates 反查(搜索过滤不影响右栏)
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
      onSuccess?.();
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
      <div className="flex flex-1 overflow-hidden">
        {/* 左列:搜索 + 候选(296px) */}
        <div className="flex w-[296px] shrink-0 flex-col overflow-hidden">
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

          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
                {keyword ? "没有匹配的会话" : "暂无联系人"}
              </div>
            ) : (
              filtered.map((c) => {
                const checked = selectedIds.has(c.channelID);
                const isChild = !!c.parentChannelID;
                return (
                  <div
                    key={`${c.channelType}-${c.channelID}`}
                    onClick={() => toggle(c.channelID)}
                    className={`flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)] ${
                      isChild ? "pl-9" : ""
                    }`}
                  >
                    {/* 方形 checkbox(对齐老仓 .wk-checkbox__box 18x18 rounded-xs ✓ stroke) */}
                    <span
                      role="checkbox"
                      aria-checked={checked}
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors ${
                        checked
                          ? "border-brand bg-brand text-text-inverse"
                          : "border-border-strong bg-bg-surface"
                      }`}
                    >
                      {checked ? <Check size={12} strokeWidth={2.5} /> : null}
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

        <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

        {/* 右列:已选预览 */}
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
