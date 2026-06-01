import { useCallback, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { Code as CodeIcon, Download, Eye, ExternalLink, List, X } from "lucide-react";
import { chatSidePanelActions, chatSidePanelStore } from "@/features/chat/stores/chat-side-panel";
import { openInNewWindow, triggerDownload } from "@/features/chat/lib/file-download";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { fileRendererRegistry } from "@/features/chat/file-preview/registry";
import { getExtension } from "@/features/chat/file-preview/types";
import type { FilePreviewInfo, TocItem } from "@/features/chat/file-preview/types";

/**
 * 文件预览面板(1:1 对齐旧 dmworkbase Components/FilePreviewPanel + FilePreviewHeader)。
 *
 * **布局**:跟 ThreadListPanel 同形态(`w-[380px] shrink-0 border-l bg-bg-base`),
 * 互斥渲染 — chat-main 根据 chatSidePanelStore.kind 决定渲染哪个 panel。
 *
 * **header**(对齐旧 .wk-file-preview-header):
 *   [file icon 20px] [文件名(truncate)]    [视图切换 | TOC] [|] [外链] [下载] [|] [关闭]
 *
 *   - file icon 20px(复用 FileTypeIcon)— 1:1 对齐旧 `__file-icon`
 *   - 视图切换(预览/源码)— **仅 markdown 显示**(其他 renderer 不消费 viewMode)
 *   - TOC 目录(List 图标)— **仅 markdown + tocItems.length>0** 显示;
 *     click 弹 absolute popup 列出 h1/h2/h3,选项后 scrollIntoView + auto-close
 *   - 分隔线 1px(对齐旧 `__sep`)
 *
 * **未实现**(P4 没接入相关流程,留 TODO):
 *   - 回复(IconMessage / onReply)— 需要 reply-to-file 流程
 *   - 文件下拉选择器(浮窗会话内所有 file 消息)— 需要会话文件列表 API
 *   - 子区返回(ArrowLeft)— 新仓 panel 不区分子区入口场景
 *
 * **content**:flex-1 overflow-hidden,通过 `fileRendererRegistry.getRenderer(ext)`
 * 按扩展名分发 renderer(策略模式,对齐旧 Components/FilePreviewPanel/registry.ts)。
 */
export function FilePreviewPanel() {
  const state = useStore(chatSidePanelStore);
  if (state.kind !== "filePreview") return null;
  return <FilePreviewPanelInner file={state.file} />;
}

function FilePreviewPanelInner({ file }: { file: FilePreviewInfo }) {
  const ext = getExtension(file.ext, file.name);
  const { renderer: Renderer, type } = fileRendererRegistry.getRenderer(file.ext, file.name);

  const supportsViewToggle = type === "markdown";
  const supportsToc = type === "markdown";

  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);

  // 用 useCallback 稳定引用 — markdown-renderer useEffect deps 含 onTocChange,
  // 不稳定会导致渲染循环
  const onTocChange = useCallback((items: TocItem[]) => {
    setTocItems(items);
  }, []);

  const tocAvailable = supportsToc && tocItems.length > 0;
  const onTocPick = (id: string) => {
    setTocOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <aside className="relative flex h-full w-[380px] shrink-0 flex-col border-l border-border-default bg-bg-base">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-bg-surface px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileTypeIcon extension={ext} size={20} />
          <div
            className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary"
            title={file.name}
          >
            {file.name}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {supportsViewToggle ? (
            <>
              <ViewToggle value={viewMode} onChange={setViewMode} />
              <Sep />
            </>
          ) : null}
          {tocAvailable ? (
            <IconBtn
              label={tocOpen ? "收起目录" : "展开目录"}
              active={tocOpen}
              onClick={() => setTocOpen((v) => !v)}
            >
              <List size={16} />
            </IconBtn>
          ) : null}
          <IconBtn
            label="在新窗口打开"
            onClick={() => openInNewWindow(file.url)}
            disabled={!file.url}
          >
            <ExternalLink size={16} />
          </IconBtn>
          <IconBtn
            label="下载"
            onClick={() => void triggerDownload(file.url, file.name)}
            disabled={!file.url}
          >
            <Download size={16} />
          </IconBtn>
          <Sep />
          <IconBtn label="关闭" onClick={() => chatSidePanelActions.close()} danger>
            <X size={18} />
          </IconBtn>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Renderer
          file={file}
          viewMode={viewMode}
          onTocChange={onTocChange}
          onError={(msg) => {
            console.error("[FilePreviewPanel] renderer error:", msg, file);
          }}
        />
      </div>
      {tocOpen && tocAvailable ? <TocPopup items={tocItems} onPick={onTocPick} /> : null}
    </aside>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: "preview" | "source";
  onChange: (v: "preview" | "source") => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border-subtle">
      <ViewBtn active={value === "preview"} onClick={() => onChange("preview")} title="预览">
        <Eye size={12} />
        <span>预览</span>
      </ViewBtn>
      <ViewBtn active={value === "source"} onClick={() => onChange("source")} title="源码">
        <CodeIcon size={12} />
        <span>源码</span>
      </ViewBtn>
    </div>
  );
}

function ViewBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex cursor-pointer items-center gap-1 px-1.5 py-1 text-[11px] transition-colors ${
        active
          ? "bg-bg-elevated text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-border-subtle" />;
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors disabled:cursor-default disabled:opacity-40 ${
        active
          ? "bg-bg-elevated text-text-primary"
          : danger
            ? "text-text-secondary hover:bg-error/10 hover:text-error"
            : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * TOC popup — absolute 浮于 panel header 下方右侧,不挤压内容区。
 * 缩进按 level:h1 8px / h2 20px / h3 32px。
 */
function TocPopup({ items, onPick }: { items: TocItem[]; onPick: (id: string) => void }) {
  return (
    <div className="absolute top-12 right-2 z-20 max-h-[60vh] w-[240px] overflow-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onPick(it.id)}
          title={it.text}
          className="block w-full cursor-pointer truncate px-2 py-1 text-left text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary"
          style={{ paddingLeft: 8 + (it.level - 1) * 12 }}
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}
