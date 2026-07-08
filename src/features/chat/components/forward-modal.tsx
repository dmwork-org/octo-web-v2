import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type Conversation,
  type ChannelInfo,
  type MessageContent,
  type Message,
} from "wukongimjssdk";
import { Check, Search, X } from "lucide-react";
import { message } from "@/components/ui/message";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import {
  SelectedPreviewPane,
  VirtualizedSelectList,
} from "@/features/base/components/member-select/member-select";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { getMyGroups, listThreads } from "@/features/base/api/endpoints/group.api";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ThreadIcon } from "@/components/ui/thread-icon";
import {
  buildThreadChannelId,
  parseThreadChannelId,
} from "@/features/base/im/parse-thread-channel-id";
import { wrapSendContentForInjection } from "@/features/base/im/send-content-proxy";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { isConversationDisbanded } from "@/features/chat/lib/group-disband";
import { filterArchivedThreads, THREAD_STATUS_ACTIVE } from "@/features/chat/lib/thread-status";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

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
const FORWARD_ROW_HEIGHT = 36;
const FORWARD_LIST_OVERSCAN = 8;
const CHANNEL_INFO_REQUEST_TTL_MS = 3000;

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

/**
 * 清空 reply 字段的 messageSeq / messageID,保留展示信息(fromName / content)
 *
 * issue #4:逐条转发时,原消息的 reply.messageSeq 指向**原频道**的 seq。转发到新频道后,
 * 该 seq 在新频道中要么不存在要么指向完全无关的消息。点击 reply 块会触发
 * `locateReplyMessage` 在新频道循环拉历史,最坏情况导致 `fetchOneMorePage` 拿到
 * 空页(拉到顶)误判 "appended=false" 提前退出,或者 `queryFn` 抛异常被 React
 * 吞掉后 message-list 短暂空白。直接清掉跳转相关字段,让 reply block 保留视觉
 * 上下文但不再触发跨频道 locate。
 */
function stripReplyNav(content: MessageContent): void {
  const reply = (content as { reply?: { messageSeq?: number; messageID?: string } }).reply;
  if (!reply) return;
  reply.messageSeq = 0;
  reply.messageID = "";
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
    const timer = setTimeout(() => setKeyword(input), 300);
    return () => clearTimeout(timer);
  }, [input, setKeyword]);
}

function useFetchVisibleForwardCandidateInfo(
  candidate: ForwardCandidate,
  requestedInfoRef: RefObject<Map<string, number>>,
) {
  useEffect(() => {
    const requested = requestedInfoRef.current;
    if (candidate.channelType !== ChannelTypePerson) {
      requestChannelInfoOnce(candidate.channel, requested);
    }
    const parentChannelID = candidate.parentChannelID ?? parentChannelIDOf(candidate.channel);
    if (parentChannelID) {
      requestChannelInfoOnce(new Channel(parentChannelID, ChannelTypeGroup), requested);
    }
  }, [candidate, requestedInfoRef]);
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

type ForwardChannelOrg = {
  displayName?: string;
  is_external_group?: number;
  parentGroupNo?: string;
  robot?: number;
};

function channelInfoOf(channel: Channel, fallback?: ChannelInfo) {
  return WKSDK.shared().channelManager.getChannelInfo(channel) ?? fallback;
}

function orgDataOf(channel: Channel, fallback?: ChannelInfo): ForwardChannelOrg {
  return (channelInfoOf(channel, fallback)?.orgData as ForwardChannelOrg | undefined) ?? {};
}

function displayNameOf(channel: Channel, fallback?: ChannelInfo): string {
  const info = channelInfoOf(channel, fallback);
  const org = orgDataOf(channel, fallback);
  const name = org.displayName || info?.title || "";
  if (!name || name === channel.channelID) return "";
  return name;
}

function parentChannelIDOf(channel: Channel, fallback?: ChannelInfo): string | undefined {
  if (channel.channelType !== CHANNEL_TYPE_THREAD) return undefined;
  return (
    orgDataOf(channel, fallback).parentGroupNo ?? parseThreadChannelId(channel.channelID)?.groupNo
  );
}

function needsChannelInfoRefresh(channel: Channel): boolean {
  const info = channelInfoOf(channel);
  if (!info) return true;
  const org = orgDataOf(channel);
  const rawName = org.displayName || info.title || "";
  const nameMissing = !rawName || rawName === channel.channelID;
  const logoMissing = channel.channelType !== ChannelTypePerson && !info.logo;
  return nameMissing || logoMissing;
}

function requestChannelInfoOnce(channel: Channel, requested: Map<string, number>): void {
  const key = `${channel.channelType}-${channel.channelID}`;
  const now = Date.now();
  const lastRequestedAt = requested.get(key) ?? 0;
  if (now - lastRequestedAt < CHANNEL_INFO_REQUEST_TTL_MS || !needsChannelInfoRefresh(channel)) {
    return;
  }
  requested.set(key, now);
  void WKSDK.shared().channelManager.fetchChannelInfo(channel);
}

function conversationToCandidate(c: Conversation, parentChannelID?: string): ForwardCandidate {
  const org = orgDataOf(c.channel, c.channelInfo);
  const name = displayNameOf(c.channel, c.channelInfo);
  return {
    channelID: c.channel.channelID,
    channelType: c.channel.channelType,
    channel: c.channel,
    displayName: name,
    isAI: org.robot === 1,
    isExternal: c.channel.channelType === ChannelTypeGroup && org.is_external_group === 1,
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
    const parent = parentChannelIDOf(tw.channel, tw.channelInfo);
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

function candidateKey(candidate: Pick<ForwardCandidate, "channelID" | "channelType">): string {
  return `${candidate.channelType}::${candidate.channelID}`;
}

async function loadAllGroupThreadCandidates(spaceId: string): Promise<ForwardCandidate[]> {
  const groups = await getMyGroups(spaceId);
  const threadsByGroup = new Map<string, Awaited<ReturnType<typeof listThreads>>>();
  let cursor = 0;
  async function worker() {
    while (cursor < groups.length) {
      const group = groups[cursor++];
      try {
        const threads = await listThreads(group.group_no, {
          page_index: 1,
          page_size: 100,
          status: "active",
        });
        threadsByGroup.set(group.group_no, threads);
      } catch (err) {
        console.warn("[ForwardModal] listThreads failed", group.group_no, err);
        threadsByGroup.set(group.group_no, []);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, worker));

  const candidates: ForwardCandidate[] = [];
  for (const group of groups) {
    const groupChannel = new Channel(group.group_no, ChannelTypeGroup);
    candidates.push({
      channelID: group.group_no,
      channelType: ChannelTypeGroup,
      channel: groupChannel,
      displayName: group.name || group.group_no,
      isAI: false,
      isExternal: false,
      isThread: false,
    });

    for (const thread of threadsByGroup.get(group.group_no) ?? []) {
      if (!thread.short_id) continue;
      if (thread.is_member === 0) continue;
      if (thread.status != null && thread.status !== THREAD_STATUS_ACTIVE) continue;
      const channelID = thread.channel_id || buildThreadChannelId(group.group_no, thread.short_id);
      const channel = new Channel(channelID, CHANNEL_TYPE_THREAD);
      candidates.push({
        channelID,
        channelType: CHANNEL_TYPE_THREAD,
        channel,
        displayName: thread.name || channelID,
        isAI: false,
        isExternal: false,
        isThread: true,
        parentChannelID: group.group_no,
      });
    }
  }
  return candidates;
}

function mergeConversationAndSupplementalCandidates(
  conversationCandidates: ForwardCandidate[],
  supplementalCandidates: ForwardCandidate[],
): ForwardCandidate[] {
  const seen = new Set<string>();
  const supplementalGroups: ForwardCandidate[] = [];
  const supplementalThreadsByParent = new Map<string, ForwardCandidate[]>();
  const orphanSupplementalThreads: ForwardCandidate[] = [];

  for (const candidate of supplementalCandidates) {
    if (candidate.isThread) {
      const parent = candidate.parentChannelID ?? parentChannelIDOf(candidate.channel);
      if (parent) {
        const list = supplementalThreadsByParent.get(parent) ?? [];
        list.push(candidate);
        supplementalThreadsByParent.set(parent, list);
      } else {
        orphanSupplementalThreads.push(candidate);
      }
    } else {
      supplementalGroups.push(candidate);
    }
  }

  const out: ForwardCandidate[] = [];
  const push = (candidate: ForwardCandidate) => {
    const key = candidateKey(candidate);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(candidate);
  };

  for (const candidate of conversationCandidates) {
    push(candidate);
    if (candidate.channelType !== ChannelTypeGroup) continue;
    const children = supplementalThreadsByParent.get(candidate.channelID) ?? [];
    for (const child of children) push(child);
    supplementalThreadsByParent.delete(candidate.channelID);
  }

  for (const group of supplementalGroups) {
    push(group);
    const children = supplementalThreadsByParent.get(group.channelID) ?? [];
    for (const child of children) push(child);
    supplementalThreadsByParent.delete(group.channelID);
  }

  for (const children of supplementalThreadsByParent.values()) {
    for (const child of children) push(child);
  }
  for (const child of orphanSupplementalThreads) push(child);

  return out;
}

function ForwardCandidateAvatar({ candidate }: { candidate: ForwardCandidate }) {
  const parentChannelID = candidate.parentChannelID ?? parentChannelIDOf(candidate.channel);
  const avatarChannel =
    candidate.isThread && parentChannelID
      ? new Channel(parentChannelID, ChannelTypeGroup)
      : candidate.channel;
  const avatarTitle =
    candidate.isThread && parentChannelID ? displayNameOf(avatarChannel) : candidate.displayName;

  return (
    <div className="relative h-7 w-7 shrink-0">
      <ChannelAvatar channel={avatarChannel} size={28} title={avatarTitle} />
      {candidate.isThread ? (
        <span className="absolute right-[-2px] bottom-[-2px] flex h-3.5 w-3.5 items-center justify-center rounded-full border border-bg-surface bg-bg-elevated text-text-tertiary">
          <ThreadIcon size={8} />
        </span>
      ) : null}
    </div>
  );
}

interface ForwardCandidateRowProps {
  candidate: ForwardCandidate;
  checked: boolean;
  onToggle: (id: string) => void;
  requestedInfoRef: RefObject<Map<string, number>>;
}

function ForwardCandidateName({ name }: { name: string }) {
  const tt = useT();
  if (name) {
    return <span className="flex-1 truncate text-[14px] text-text-primary">{name}</span>;
  }
  return (
    <span className="flex flex-1 items-center gap-2 truncate text-[14px] text-text-tertiary">
      <span className="h-3 w-24 animate-pulse rounded-sm bg-bg-elevated" />
      <span className="sr-only">{tt("forwardModal.loading")}</span>
    </span>
  );
}

function ForwardCandidateRow({
  candidate,
  checked,
  onToggle,
  requestedInfoRef,
}: ForwardCandidateRowProps) {
  const tt = useT();
  const isChild = !!candidate.parentChannelID;
  useFetchVisibleForwardCandidateInfo(candidate, requestedInfoRef);

  return (
    <div
      onClick={() => onToggle(candidate.channelID)}
      className={`flex h-9 cursor-pointer items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)] ${
        isChild ? "pl-9" : ""
      }`}
    >
      <span
        role="checkbox"
        aria-checked={checked}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors ${
          checked ? "border-brand bg-brand text-text-inverse" : "border-border-strong bg-bg-surface"
        }`}
      >
        {checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <ForwardCandidateAvatar candidate={candidate} />
      <ForwardCandidateName name={candidate.displayName} />
      {candidate.isExternal ? (
        <span className="shrink-0 rounded-sm bg-brand-tint px-1 text-[10px] font-medium text-text-secondary">
          {tt("forwardModalLocal.external")}
        </span>
      ) : null}
      {candidate.isAI ? <AiBadge size="small" /> : null}
    </div>
  );
}

interface ForwardCandidateListProps {
  items: ForwardCandidate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  requestedInfoRef: RefObject<Map<string, number>>;
  empty: ReactNode;
}

function ForwardCandidateList({
  items,
  selectedIds,
  onToggle,
  requestedInfoRef,
  empty,
}: ForwardCandidateListProps) {
  return (
    <VirtualizedSelectList
      items={items}
      empty={empty}
      rowHeight={FORWARD_ROW_HEIGHT}
      overscan={FORWARD_LIST_OVERSCAN}
      renderRow={(candidate) => (
        <ForwardCandidateRow
          candidate={candidate}
          checked={selectedIds.has(candidate.channelID)}
          onToggle={onToggle}
          requestedInfoRef={requestedInfoRef}
        />
      )}
    />
  );
}

function ForwardSelectedRow({
  candidate,
  onRemove,
  requestedInfoRef,
}: {
  candidate: ForwardCandidate;
  onRemove: (id: string) => void;
  requestedInfoRef: RefObject<Map<string, number>>;
}) {
  const tt = useT();
  useFetchVisibleForwardCandidateInfo(candidate, requestedInfoRef);

  return (
    <div className="group flex h-9 items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]">
      <ForwardCandidateAvatar candidate={candidate} />
      <ForwardCandidateName name={candidate.displayName} />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(candidate.channelID);
        }}
        aria-label={tt("forwardModalLocal.remove")}
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.06)] hover:text-text-primary"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * 转发弹窗(1:1 对齐老仓 dmworkbase Components/ForwardModal + useForwardModal)。
 */
export function ForwardModal({
  open,
  messages,
  defaultMode = "per",
  onClose,
  onSuccess,
}: ForwardModalProps) {
  const tt = useT();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [input, setInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const channelInfoTick = useChannelInfoTick();
  const requestedInfoRef = useRef<Map<string, number>>(new Map());

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

  const { data: groupThreadCandidates } = useQuery({
    queryKey: ["chat", "forward", "group-thread-candidates", spaceId ?? "_"],
    queryFn: () => loadAllGroupThreadCandidates(spaceId!),
    enabled: open && !!spaceId,
    staleTime: 60 * 1000,
  });

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const allCandidates = useMemo<ForwardCandidate[]>(() => {
    void channelInfoTick;
    const fromConvs = orderConversationsWithThreads(filterArchivedThreads(conversations ?? []));
    const fromChats = mergeConversationAndSupplementalCandidates(
      fromConvs,
      groupThreadCandidates ?? [],
    );
    const convDmIds = new Set(
      fromChats.filter((c) => c.channelType === ChannelTypePerson).map((c) => c.channelID),
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
    // 已解散的群/子区不可作为转发目标(只读),从候选中过滤。
    return [...fromChats, ...fromMembers].filter((c) => !isConversationDisbanded(c.channel));
  }, [channelInfoTick, conversations, groupThreadCandidates, members, myUid]);

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
    return allCandidates.filter((c) => includeIDs.has(c.channelID));
  }, [allCandidates, keyword]);

  const selectedCandidates = useMemo<ForwardCandidate[]>(() => {
    return allCandidates.filter((c) => selectedIds.has(c.channelID));
  }, [allCandidates, selectedIds]);

  const mu = useMutation({
    mutationFn: async () => {
      const targets = selectedCandidates.map((c) => c.channel);
      const chat = WKSDK.shared().chatManager;
      const tasks: Promise<unknown>[] = [];
      if (mode === "merge") {
        for (const target of targets) {
          const mf = buildMergeforward(messages);
          tasks.push(
            chat.send(
              wrapSendContentForInjection(mf, {
                spaceId: target.channelType === ChannelTypePerson ? spaceId : null,
              }),
              target,
            ),
          );
        }
      } else {
        for (const target of targets) {
          for (const m of messages) {
            const cloned = cloneContent(m.content);
            // issue #4:清掉 reply 的 messageSeq/messageID,避免在新频道点击
            // reply 时跨频道 locate 历史(原 seq 在新频道无意义,可能拉到空页
            // 或异常,导致 message-list 出现空白闪烁)。
            stripReplyNav(cloned);
            tasks.push(
              chat.send(
                wrapSendContentForInjection(cloned, {
                  spaceId: target.channelType === ChannelTypePerson ? spaceId : null,
                }),
                target,
              ),
            );
          }
        }
      }
      const results = await Promise.allSettled(tasks);
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw Object.assign(new Error(t("forwardModalLocal.toast.failed")), {
          failed,
          total: tasks.length,
        });
      }
    },
    onSuccess: () => {
      if (isMulti) {
        message.success(
          mode === "merge"
            ? t("forwardModalLocal.toast.mergeSuccess", {
                values: { count: messages.length, targets: selectedIds.size },
              })
            : t("forwardModalLocal.toast.perSuccess", {
                values: { count: messages.length, targets: selectedIds.size },
              }),
        );
      } else {
        message.success(
          t("forwardModalLocal.toast.singleSuccess", { values: { targets: selectedIds.size } }),
        );
      }
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      const detail = err as Error & { failed?: number; total?: number };
      if (detail.failed && detail.total && detail.failed < detail.total) {
        message.error(
          t("forwardModalLocal.toast.partialFailed", {
            values: { failed: detail.failed, total: detail.total },
          }),
        );
        return;
      }
      message.error(err instanceof Error ? err.message : t("forwardModalLocal.toast.failed"));
    },
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
    ? mode === "merge"
      ? tt("forwardModalLocal.titleMerge", { values: { count: messages.length } })
      : tt("forwardModalLocal.titlePer", { values: { count: messages.length } })
    : tt("forwardModalLocal.title");

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
            {tt("forwardModalLocal.cancel")}
          </button>
          <button
            type="button"
            onClick={() => mu.mutate()}
            disabled={selectedIds.size === 0 || mu.isPending}
            className="inline-flex h-9 min-w-16 items-center justify-center rounded-full bg-[#1c1c23] px-4 text-[14px] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {mu.isPending
              ? tt("forwardModalLocal.sending")
              : selectedIds.size > 0
                ? tt("forwardModalLocal.confirmWithCount", { values: { count: selectedIds.size } })
                : tt("forwardModalLocal.confirm")}
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
              placeholder={tt("forwardModalLocal.searchPlaceholder")}
              className="flex-1 border-0 bg-transparent text-[13px] text-text-primary placeholder:text-[rgba(28,28,35,0.35)] focus:outline-none"
            />
          </div>

          <ForwardCandidateList
            items={filtered}
            selectedIds={selectedIds}
            onToggle={toggle}
            requestedInfoRef={requestedInfoRef}
            empty={
              <div className="flex h-20 items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
                {keyword
                  ? tt("forwardModalLocal.noMatches")
                  : tt("forwardModalLocal.noContactsLocal")}
              </div>
            }
          />
        </div>

        <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

        {/* 右列:已选预览 */}
        <SelectedPreviewPane
          items={selectedCandidates}
          emptyLabel={tt("forwardModalLocal.notSelected")}
          countLabel={tt("forwardModalLocal.selectedCount", {
            values: { count: selectedCandidates.length },
          })}
          getKey={(candidate) => `sel-${candidate.channelType}-${candidate.channelID}`}
          renderItem={(candidate) => (
            <ForwardSelectedRow
              candidate={candidate}
              onRemove={toggle}
              requestedInfoRef={requestedInfoRef}
            />
          )}
        />
      </div>
    </BaseDialog>
  );
}
