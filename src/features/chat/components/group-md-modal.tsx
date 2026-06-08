import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Channel } from "wukongimjssdk";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
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

function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
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
    setDraft(data.content);
    setBaseline(data.content);
    setVersion(data.version);
  }, [data, setDraft, setBaseline, setVersion]);
}

/**
 * GROUP.md 二级抽屉(对应旧 dmworkbase GroupMdEditor)。
 *
 * 浮动元素壳层统一规范 Phase D — 走 BaseDrawer side=right + ← 返回头部。
 * 内嵌 ConfirmModal(删除确认)自动 z-dialog-secondary。
 */
export function GroupMdModal({ open, channel, canEdit, onClose }: GroupMdModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"edit" | "preview">(canEdit ? "edit" : "preview");
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [version, setVersion] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 子区(channelType=5)走 thread MD endpoint;否则群 MD
  const isThread = channel.channelType === 5;
  const parsed = isThread ? parseThreadChannelId(channel.channelID) : null;
  const groupNoForApi = parsed?.groupNo ?? channel.channelID;
  const shortIdForApi = parsed?.shortId;

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
            <div className="flex gap-1">
              <Button
                size="small"
                type={mode === "edit" ? "primary" : "tertiary"}
                onClick={() => setMode("edit")}
              >
                {tt("groupMdModal.edit")}
              </Button>
              <Button
                size="small"
                type={mode === "preview" ? "primary" : "tertiary"}
                onClick={() => setMode("preview")}
              >
                {tt("groupMdModal.preview")}
              </Button>
            </div>
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
              <article className="prose prose-sm max-w-none text-text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
              </article>
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

      <ConfirmModal
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
