import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ThreadIcon } from "@/components/ui/thread-icon";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { wrapSendContentForInjection } from "@/features/base/im/send-content-proxy";
import {
  MergeforwardContent,
  type MergeforwardUser,
} from "@/features/base/im/mergeforward-content";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
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
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => FORWARD_ROW_HEIGHT,
    overscan: FORWARD_LIST_OVERSCAN,
  });

  if (items.length === 0) {
    return <div className="flex-1 overflow-y-auto py-1">{empty}</div>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const candidate = items[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ForwardCandidateRow
                candidate={candidate}
                checked={selectedIds.has(candidate.channelID)}
                onToggle={onToggle}
                requestedInfoRef={requestedInfoRef}
              />
            </div>
          );
        })}
      </div>
    </div>
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

  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const allCandidates = useMemo<ForwardCandidate[]>(() => {
    void channelInfoTick;
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
  }, [channelInfoTick, conversations, members, myUid]);

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
      if (mode === "merge") {
        for (const target of targets) {
          const mf = buildMergeforward(messages);
          await chat.send(
            wrapSendContentForInjection(mf, {
              spaceId: target.channelType === ChannelTypePerson ? spaceId : null,
            }),
            target,
          );
        }
      } else {
        for (const target of targets) {
          for (const m of messages) {
            await chat.send(
              wrapSendContentForInjection(cloneContent(m.content), {
                spaceId: target.channelType === ChannelTypePerson ? spaceId : null,
              }),
              target,
            );
          }
        }
      }
    },
    onSuccess: () => {
      if (isMulti) {
        toast.success(
          mode === "merge"
            ? t("forwardModalLocal.toast.mergeSuccess", {
                values: { count: messages.length, targets: selectedIds.size },
              })
            : t("forwardModalLocal.toast.perSuccess", {
                values: { count: messages.length, targets: selectedIds.size },
              }),
        );
      } else {
        toast.success(
          t("forwardModalLocal.toast.singleSuccess", { values: { targets: selectedIds.size } }),
        );
      }
      onSuccess?.();
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("forwardModalLocal.toast.failed")),
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
        <div className="flex flex-1 flex-col overflow-hidden py-2">
          {selectedCandidates.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
              {tt("forwardModalLocal.notSelected")}
            </div>
          ) : (
            <>
              <div className="shrink-0 px-2 pb-1.5 text-[12px] text-[rgba(28,28,35,0.4)]">
                {tt("forwardModalLocal.selectedCount", {
                  values: { count: selectedCandidates.length },
                })}
              </div>
              <div className="flex-1 overflow-y-auto">
                {selectedCandidates.map((candidate) => (
                  <ForwardSelectedRow
                    key={`sel-${candidate.channelType}-${candidate.channelID}`}
                    candidate={candidate}
                    onRemove={toggle}
                    requestedInfoRef={requestedInfoRef}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </BaseDialog>
  );
}
