import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Channel } from "wukongimjssdk";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { useDrawerEnterTransition } from "@/features/chat/hooks/use-drawer-enter-transition.hook";
import {
  deleteGroupMd,
  deleteThreadMd,
  getGroupMd,
  getThreadMd,
  updateGroupMd,
  updateThreadMd,
} from "@/features/base/api/endpoints/group.api";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

interface GroupMdModalProps {
  open: boolean;
  channel: Channel;
  canEdit: boolean;
  onClose: () => void;
}

const MAX_BYTES = 10240;

const PLACEHOLDER_TEXT = `# 群组说明

## 简介
描述本群的用途和主题...

## 规则
1. 规则一
2. 规则二

## 常用链接
- 链接一
- 链接二
`;

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
 * GROUP.md 二级抽屉(对应旧 dmworkbase GroupMdEditor):
 *
 *   ┌ Header(← + GROUP.md)
 *   ├ Toolbar(canEdit:编辑/预览 tab + 删除/保存按钮)
 *   ├ 字节数 + 版本号(canEdit 显示)
 *   └ 编辑 textarea / 预览 markdown
 *
 * canEdit=false → 只显示预览区(只读)。
 */
export function GroupMdModal({ open, channel, canEdit, onClose }: GroupMdModalProps) {
  const qc = useQueryClient();
  const entered = useDrawerEnterTransition(open);
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
      toast.success("已保存");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
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
      toast.success("已删除");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "删除失败"),
  });

  if (!open) return null;

  const byteLen = getByteLength(draft);
  const overLimit = byteLen > MAX_BYTES;
  const dirty = draft !== baseline;
  const isLoading = mdQ.isLoading;
  const isPreview = mode === "preview" || !canEdit;

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-md transform flex-col overflow-hidden border-l border-border-default bg-bg-surface shadow-xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="flex-1 text-sm font-semibold text-text-primary">GROUP.md</h2>
        </header>

        {canEdit ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
            <div className="flex gap-1">
              <Button
                size="small"
                type={mode === "edit" ? "primary" : "tertiary"}
                onClick={() => setMode("edit")}
              >
                编辑
              </Button>
              <Button
                size="small"
                type={mode === "preview" ? "primary" : "tertiary"}
                onClick={() => setMode("preview")}
              >
                预览
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
                  删除
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
                保存
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
              加载中…
            </div>
          ) : isPreview ? (
            draft ? (
              <article className="prose prose-sm max-w-none text-text-primary">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
              </article>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                暂未配置 GROUP.md
              </div>
            )
          ) : (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={PLACEHOLDER_TEXT}
              rows={20}
              className="min-h-80 w-full flex-1 resize-none rounded-md border border-border-default bg-bg-base p-3 font-mono text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          )}
        </div>
      </aside>

      {confirmDelete ? (
        <ConfirmModal
          open
          title="删除 GROUP.md"
          content="确定要删除 GROUP.md 吗?此操作不可撤销。"
          okText="删除"
          okDanger
          okLoading={deleteMu.isPending}
          onOk={() => deleteMu.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
