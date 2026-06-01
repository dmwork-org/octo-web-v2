import { useStore } from "@tanstack/react-store";
import { Download, ExternalLink, X } from "lucide-react";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { openInNewWindow, triggerDownload } from "@/features/chat/lib/file-download";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";

/**
 * 文件预览面板(1:1 对齐旧 dmworkbase Components/FilePreviewPanel)。
 *
 * **布局**:跟 ThreadListPanel 同形态(`w-[380px] shrink-0 border-l bg-bg-base`),
 * 互斥渲染 — chat-main 根据 chatSidePanelStore.kind 决定渲染哪个 panel。
 *
 * **header**(对齐旧 `.wk-file-preview-header`):
 *   [文件名(truncate)] [ExternalLink] [Download] [Close]
 *   - 高 48 / bg-surface / border-bottom
 *
 * **content**:flex-1 overflow-hidden,通过 registry 按 ext 分发 renderer。
 *
 * **commit 1**:registry 尚未实现,先用占位 "渲染器加载中…"。commit 2 加入
 * Fallback/Image/Pdf,commit 3 加 Markdown/Text/Code,commit 4 加 Json/Jsonl/
 * Excel/Html。
 */
export function FilePreviewPanel() {
  const state = useStore(chatSidePanelStore);
  if (state.kind !== "filePreview") return null;
  return <FilePreviewPanelInner file={state.file} />;
}

function FilePreviewPanelInner({ file }: { file: FilePreviewInfo }) {
  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border-default bg-bg-base">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-4">
        <div
          className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
          title={file.name}
        >
          {file.name}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconBtn
            label="在新窗口打开"
            onClick={() => openInNewWindow(file.url)}
            disabled={!file.url}
          >
            <ExternalLink size={18} />
          </IconBtn>
          <IconBtn
            label="下载"
            onClick={() => void triggerDownload(file.url, file.name)}
            disabled={!file.url}
          >
            <Download size={18} />
          </IconBtn>
          <IconBtn label="关闭" onClick={() => chatSidePanelActions.close()} danger>
            <X size={20} />
          </IconBtn>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* commit 2~4 在此处接入 registry 分发 renderer */}
        <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
          预览渲染器即将接入(commit 2~4)
        </div>
      </div>
    </aside>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors disabled:cursor-default disabled:opacity-40 ${
        danger ? "hover:bg-error/10 hover:text-error" : "hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
