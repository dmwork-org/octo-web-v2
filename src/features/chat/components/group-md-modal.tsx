import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Channel } from "wukongimjssdk";
import { Markdown } from "@/components/ui/markdown";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import {
  deleteGroupMd,
  deleteThreadMd,
  getGroupMd,
  getThreadMd,
  updateGroupMd,
  updateThreadMd,
} from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface GroupMdModalProps {
  open: boolean;
  channel: Channel;
  canEdit: boolean;
  onClose: () => void;
}

const MAX_BYTES = 10240;
type GroupMdMode = "edit" | "preview";

function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * 兼容历史数据:GROUP.md content 可能被以 literal `\n` / `\r\n` 字面量形式
 * 落库(跨端存储路径的 escape 历史包袱),此处把 literal 还原为真换行,
 * 让 markdown 渲染正确(对齐上游 `0f024d2d` normalizeGroupMdContent)。
 *
 * Guard 条件:
 * - 已包含真换行 → 视为已 normalize,原样返回
 * - 不含 literal `\n` / `\r\n` → 无需处理
 * 否则全局 replace。
 */
function normalizeGroupMdContent(content: string): string {
  if (
    !content ||
    content.includes("\n") ||
    (!content.includes("\\n") && !content.includes("\\r\\n"))
  ) {
    return content;
  }
  return content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
}

/** 拉到内容后把 textarea 同步到 server 值(避免编辑残留)。 */
function useSyncDraftFromServer(
  data: { content: string; version: number } | undefined,
  setDraft: (v: string) => void,
  setBaseline: (v: string) => void,
  setVersion: (n: number) => void,
) {
  useEffect(() => {
    if (!data) return;
    const normalized = normalizeGroupMdContent(data.content);
    setDraft(normalized);
    setBaseline(normalized);
    setVersion(data.version);
  }, [data, setDraft, setBaseline, setVersion]);
}

function useResetGroupMdPreviewMode(
  open: boolean,
  channelId: string,
  setMode: (v: GroupMdMode) => void,
) {
  useEffect(() => {
    if (open) setMode("preview");
  }, [open, channelId, setMode]);
}

/**
 * GROUP.md 二级抽屉(对应旧 dmworkbase GroupMdEditor)。
 *
 * 浮动元素壳层统一规范 Phase D — 走 BaseDrawer side=right + ← 返回头部。
 * 内嵌 ConfirmDialog(删除确认)自动 z-dialog-secondary。
 */
export function GroupMdModal({ open, channel, canEdit, onClose }: GroupMdModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const [mode, setMode] = useState<GroupMdMode>("preview");
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 子区(channelType=5)走 thread MD endpoint;否则群 MD
  const isThread = channel.channelType === 5;
  const parsed = isThread ? parseThreadChannelId(channel.channelID) : null;
  const groupNoForApi = parsed?.groupNo ?? channel.channelID;
  const shortIdForApi = parsed?.shortId;

  useResetGroupMdPreviewMode(open, channel.channelID, setMode);

  const mdQ = useQuery({
    queryKey: ["chat", isThread ? "thread-md" : "group-md", channel.channelID],
    queryFn: () =>
      isThread && shortIdForApi
        ? getThreadMd(groupNoForApi, shortIdForApi)
        : getGroupMd(channel.channelID),
    enabled: open,
    staleTime: 30 * 1000,
  });

  useSyncDraftFromServer(mdQ.data, setDraft, setBaseline, setVersion);

  const refreshChannelInfo = () => {
    void qc.invalidateQueries({
      queryKey: ["chat", isThread ? "thread-md" : "group-md", channel.channelID],
    });
  };

  const saveMu = useMutation({
    mutationFn: (content: string) =>
      isThread && shortIdForApi
        ? updateThreadMd(groupNoForApi, shortIdForApi, content)
        : updateGroupMd(channel.channelID, content),
    onSuccess: (resp) => {
      setBaseline(draft);
      setVersion(resp.version);
      refreshChannelInfo();
      toast.success(t("groupMdModal.toast.saved"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMdModal.toast.saveFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: () =>
      isThread && shortIdForApi
        ? deleteThreadMd(groupNoForApi, shortIdForApi)
        : deleteGroupMd(channel.channelID),
    onSuccess: () => {
      setDraft("");
      setBaseline("");
      setVersion(0);
      refreshChannelInfo();
      setConfirmDelete(false);
      toast.success(t("groupMdModal.toast.deleted"));
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("groupMdModal.toast.deleteFailed")),
  });

  const byteLen = getByteLength(draft);
  const overLimit = byteLen > MAX_BYTES;
  const dirty = draft !== baseline;
  const isLoading = mdQ.isLoading;
  const isPreview = mode === "preview" || !canEdit;

  return (
    <>
      <BaseDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side="right"
        size="md"
        title="GROUP.md"
        showBackButton
        showCloseButton={false}
        onBack={onClose}
      >
        {canEdit ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
            <div className="inline-flex items-center rounded-md border border-border-subtle">
              <button
                type="button"
                className={`h-7 rounded-l-[5px] px-2.5 text-sm font-medium transition-colors ${
                  !isPreview
                    ? "bg-brand text-white shadow-sm"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
                onClick={() => setMode("edit")}
              >
                {tt("groupMdModal.edit")}
              </button>
              <button
                type="button"
                className={`h-7 rounded-r-[5px] border-l border-border-subtle px-2.5 text-sm font-medium transition-colors ${
                  isPreview
                    ? "bg-brand text-white shadow-sm"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                }`}
                onClick={() => setMode("preview")}
              >
                {tt("groupMdModal.preview")}
              </button>
            </div>
            {!isPreview ? (
              <div className="flex gap-2">
                {baseline ? (
                  <Button
                    size="small"
                    type="danger"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteMu.isPending}
                  >
                    {tt("groupMdModal.delete")}
                  </Button>
                ) : null}
                <Button
                  size="small"
                  type="primary"
                  theme="solid"
                  loading={saveMu.isPending}
                  disabled={!dirty || overLimit}
                  onClick={() => saveMu.mutate(draft)}
                >
                  {tt("groupMdModal.save")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {canEdit ? (
          <div className="shrink-0 px-4 py-1.5 text-[11px] text-text-tertiary">
            <span className={overLimit ? "text-error" : ""}>
              {byteLen} / {MAX_BYTES} bytes
            </span>
            {version > 0 ? <span className="ml-2">v{version}</span> : null}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {tt("groupMdModal.loading")}
            </div>
          ) : isPreview ? (
            draft ? (
              <Markdown content={draft} enableMath />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {tt("groupMdModal.empty")}
              </div>
            )
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tt("groupMdModal.placeholder")}
              rows={20}
              className="min-h-80 w-full flex-1 resize-none rounded-md border border-border-default bg-bg-base p-3 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          )}
        </div>
      </BaseDrawer>

      <ConfirmDialog
        open={confirmDelete}
        title={tt("groupMdModal.confirmDeleteTitle")}
        content={tt("groupMdModal.confirmDeleteContent")}
        okText={tt("groupMdModal.delete")}
        okDanger
        okLoading={deleteMu.isPending}
        onOk={() => deleteMu.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
