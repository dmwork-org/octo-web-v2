import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { Plus } from "lucide-react";
import { message } from "@/components/ui/message";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { ForwardModal } from "@/features/chat/components/forward-modal";
import { SmartCreateModal } from "@/features/matter/components/smart-create-modal";
import { deleteMessages as deleteMessagesApi } from "@/features/base/api/endpoints/message.api";
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { chatSelectionActions, chatSelectionStore } from "@/features/chat/stores/chat-selection";
import { authStore } from "@/features/base/stores/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addTimelineEntry, listMatters } from "@/features/matter/api/matter.api";
import { mattersListInfiniteQueryKey } from "@/features/matter/queries/matters.query";
import { safeAiServiceText } from "@/features/chat/lib/ai-error-message";
import type {
  ExtractMessage,
  ExtractMessageAttachment,
} from "@/features/matter/types/matter.types";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface SelectionToolbarProps {
  channel: Channel;
}

type ForwardMode = "per" | "merge";

/**
 * 多选模式底部浮层(对齐旧 dmworkbase Conversation.MultiplePanel)。
 *
 *   ╭ 逐条转发 | 合并转发 | 创建新事项 | 同步到事项 | 删除 | ✕ ╮
 *
 * 同步到事项:Popover 菜单(对齐老仓 MatterLinkMenu)— 顶部"创建新事项"主项 +
 * 分隔 + 本群关联 Matter 列表(查 listMatters by channel_id)。点 matter 调
 * addTimelineEntry 同步消息内容到 matter timeline。
 */
export function SelectionToolbar({ channel }: SelectionToolbarProps) {
  const tt = useT();
  const qc = useQueryClient();
  const ids = useStore(chatSelectionStore, (s) => s.ids);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const count = ids.size;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [forwardMessages, setForwardMessages] = useState<Message[]>([]);
  const [smartCreateMessages, setSmartCreateMessages] = useState<Message[]>([]);
  const [forwardMode, setForwardMode] = useState<ForwardMode>("per");
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);

  const findMessages = (): Message[] => {
    const data = qc.getQueryData<{ pages: Message[][]; pageParams: unknown[] }>(
      messagesQueryKey(channel.channelID, channel.channelType),
    );
    if (!data) return [];
    const all = data.pages.flat();
    return all.filter((m) => ids.has(m.clientMsgNo));
  };

  const removeFromCache = (msgs: Message[]) => {
    const set = new Set(msgs.map((m) => m.clientMsgNo));
    qc.setQueriesData<{ pages: Message[][]; pageParams: unknown[] }>(
      { queryKey: messagesQueryKey(channel.channelID, channel.channelType) },
      (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((p) => p.filter((m) => !set.has(m.clientMsgNo))),
        };
      },
    );
  };

  const deleteMu = useMutation({
    mutationFn: async () => {
      const msgs = findMessages();
      await deleteMessagesApi(
        msgs.map((m) => ({
          message_id: m.messageID,
          channel_id: m.channel.channelID,
          channel_type: m.channel.channelType,
          message_seq: m.messageSeq,
        })),
      );
      return msgs;
    },
    onSuccess: (msgs) => {
      removeFromCache(msgs);
      message.success(t("selectionToolbar.toast.deleted", { values: { count: msgs.length } }));
      setConfirmDelete(false);
      chatSelectionActions.exit();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("selectionToolbar.toast.deleteFailed")),
  });

  const openForward = (mode: ForwardMode) => {
    const msgs = findMessages();
    if (msgs.length === 0) return;
    setForwardMode(mode);
    setForwardMessages(msgs);
  };

  const onCreateMatter = () => {
    const msgs = findMessages();
    if (msgs.length === 0) return;
    setSmartCreateMessages(msgs);
  };

  /**
   * 查本群关联 Matter 列表(对齐老仓 module.tsx L497-507:用 channel_id 过滤,
   * 避免混入"我相关但跟本群无关"的 matter)。limit 20 跟老仓一致。
   *
   * staleTime 0:每次打开菜单都视作过期 → 立即重新拉取最新事项列表,
   * 避免刚创建/刚同步的事项因缓存没及时出现在候选里。
   */
  const mattersQ = useQuery({
    queryKey: ["matter", "by-channel", channel.channelID, channel.channelType],
    queryFn: () => listMatters({ channel_id: channel.channelID, limit: 20 }),
    enabled: syncMenuOpen,
    staleTime: 0,
  });

  /**
   * 从一条消息提取附件(file/image/video/voice 等媒体消息携带 url)。
   * 产出文件由后端从这些 attachments 提取,**漏传则事项产出文件为空**(对齐旧
   * dmworktodo:同步时传 m.attachments)。
   */
  const extractAttachments = (m: Message): ExtractMessageAttachment[] => {
    const c = m.content as unknown as {
      url?: string;
      remoteUrl?: string;
      name?: string;
      size?: number;
      ext?: string;
    } | null;
    if (!c) return [];
    const fileUrl = c.url || c.remoteUrl || "";
    if (!fileUrl) return [];
    return [
      {
        file_url: fileUrl,
        file_name: c.name || "",
        // 文件大小一并带上,后端据此填充产出文件大小列(否则展示横杠)。
        ...(typeof c.size === "number" && c.size > 0 ? { file_size: c.size } : {}),
        ...(c.ext ? { mime_type: c.ext } : {}),
      },
    ];
  };

  /**
   * 同步到已有 matter:对齐旧 dmworktodo —— 不在前端拼接消息原文,而是把原始
   * 消息列表(msgs)+ participant_uid 传给后端,由后端 LLM 抽取进展**摘要**写入
   * timeline。这样事项时间线里看到的是提炼后的进展,而非聊天原文。
   * 附件(attachments)也一并传,后端据此生成事项的"产出文件"。
   */
  const toExtractMsgs = (msgs: Message[]): ExtractMessage[] =>
    msgs.map((m) => {
      const info = WKSDK.shared().channelManager.getChannelInfo(
        new Channel(m.fromUID, ChannelTypePerson),
      );
      return {
        message_id: m.messageID,
        from_uid: m.fromUID,
        from_uname: info?.title,
        timestamp: m.timestamp,
        content: safeAiServiceText(
          m.content?.conversationDigest ?? "",
          t("message.aiServiceUnavailable"),
        ),
        attachments: extractAttachments(m),
      };
    });

  const syncMu = useMutation({
    mutationFn: async (matterId: string) => {
      const msgs = findMessages();
      if (msgs.length === 0) throw new Error(t("selectionToolbar.error.nothingToSync"));
      await addTimelineEntry(matterId, {
        channel_id: channel.channelID,
        channel_type: channel.channelType,
        participant_uid: myUid,
        msgs: toExtractMsgs(msgs),
      });
    },
    onSuccess: () => {
      message.success(t("selectionToolbar.toast.synced"));
      setSyncMenuOpen(false);
      chatSelectionActions.exit();
      void qc.invalidateQueries({ queryKey: mattersListInfiniteQueryKey(null, undefined) });
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("selectionToolbar.toast.syncFailed")),
  });

  const btn =
    "flex h-8 items-center rounded-full px-4 text-[14px] font-medium leading-none text-[#1c1c23] transition-colors hover:bg-[rgba(28,28,35,0.08)] disabled:cursor-not-allowed disabled:opacity-40";
  const btnDanger =
    "flex h-8 items-center rounded-full px-4 text-[14px] font-medium leading-none text-[#FF563B] transition-colors hover:bg-[rgba(255,86,59,0.08)] disabled:cursor-not-allowed disabled:opacity-40";
  const sep = "h-5 w-px shrink-0 bg-[rgba(28,28,35,0.15)]";

  const matters = mattersQ.data?.data ?? [];

  return (
    <>
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white px-4 py-1 whitespace-nowrap shadow-[0_4px_16px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("per")}
            className={btn}
          >
            {tt("selectionToolbar.forwardOneByOne")}
          </button>
          <span className={sep} />
          <button
            type="button"
            disabled={count === 0}
            onClick={() => openForward("merge")}
            className={btn}
          >
            {tt("selectionToolbar.mergeForward")}
          </button>
          <span className={sep} />
          <button type="button" disabled={count === 0} onClick={onCreateMatter} className={btn}>
            {tt("selectionToolbar.createMatter")}
          </button>
          <span className={sep} />
          <Popover
            open={syncMenuOpen}
            onOpenChange={(next) => {
              setSyncMenuOpen(next);
              // 打开菜单时立即拉最新事项列表(staleTime 0 + 显式 refetch 双保险:
              // query 已挂载过时 enabled 重新置 true 不一定触发请求)。
              if (next) void mattersQ.refetch();
            }}
          >
            <PopoverTrigger asChild>
              <button type="button" disabled={count === 0} className={btn}>
                {tt("selectionToolbar.syncToMatter")}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              className="flex w-[260px] flex-col p-0"
            >
              <div className="shrink-0 px-3 py-2 text-[12px] text-[rgba(28,28,35,0.5)]">
                {tt("selectionToolbar.linkedMattersTitle")}
              </div>
              {/* 创建新事项 主项 */}
              <button
                type="button"
                onClick={() => {
                  setSyncMenuOpen(false);
                  onCreateMatter();
                }}
                className="flex items-center gap-2 px-3 py-2 text-left text-[14px] font-medium text-brand transition-colors hover:bg-[rgba(28,28,35,0.04)]"
              >
                <Plus size={14} />
                <span>{tt("selectionToolbar.createMatter")}</span>
              </button>
              <div className="my-1 h-px bg-[rgba(28,28,35,0.06)]" />
              <div className="shrink-0 px-3 py-1 text-[12px] text-[rgba(28,28,35,0.4)]">
                {tt("selectionToolbar.syncToExisting")}
              </div>
              <div className="max-h-[280px] overflow-y-auto py-1">
                {mattersQ.isFetching ? (
                  <div className="flex items-center justify-center py-4 text-[12px] text-text-tertiary">
                    {tt("selectionToolbar.loading")}
                  </div>
                ) : matters.length === 0 ? (
                  <div className="flex items-center justify-center py-4 text-[12px] text-text-tertiary">
                    {tt("selectionToolbar.noMatters")}
                  </div>
                ) : (
                  matters.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={syncMu.isPending}
                      onClick={() => syncMu.mutate(m.id)}
                      className="block w-full truncate px-3 py-2 text-left text-[14px] text-text-primary transition-colors hover:bg-[rgba(28,28,35,0.04)] disabled:cursor-not-allowed disabled:opacity-50"
                      title={m.title}
                    >
                      {m.title}
                    </button>
                  ))
                )}
              </div>
              {syncMu.isPending ? (
                <div className="border-t border-[rgba(28,28,35,0.06)] px-3 py-2 text-center text-[12px] text-text-tertiary">
                  {tt("selectionToolbar.syncing")}
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
          <span className={sep} />
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirmDelete(true)}
            className={btnDanger}
          >
            {tt("selectionToolbar.delete")}
          </button>
          <span className={sep} />
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={tt("selectionToolbar.exitMultiSelect")}
                onClick={() => chatSelectionActions.exit()}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.08)] hover:text-[#1c1c23]"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path
                    d="M1 1L13 13M13 1L1 13"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent>{tt("selectionToolbar.exitMultiSelect")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        content={tt("selectionToolbar.confirmDeleteContent", { values: { count } })}
        okDanger
        okText={tt("selectionToolbar.delete")}
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      <ForwardModal
        open={forwardMessages.length > 0}
        messages={forwardMessages}
        defaultMode={forwardMode}
        onClose={() => setForwardMessages([])}
        onSuccess={() => chatSelectionActions.exit()}
      />

      <SmartCreateModal
        open={smartCreateMessages.length > 0}
        channel={channel}
        messages={smartCreateMessages}
        onClose={() => {
          setSmartCreateMessages([]);
          chatSelectionActions.exit();
        }}
      />
    </>
  );
}
