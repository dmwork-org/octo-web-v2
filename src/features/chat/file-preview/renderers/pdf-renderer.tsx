import { useCallback, useEffect, useRef, useState } from "react";
import {
  Viewer,
  Worker,
  SpecialZoomLevel,
  type DocumentLoadEvent,
  type PageChangeEvent,
  type ZoomEvent,
} from "@react-pdf-viewer/core";
import { thumbnailPlugin } from "@react-pdf-viewer/thumbnail";
import { bookmarkPlugin } from "@react-pdf-viewer/bookmark";
import {
  zoomPlugin,
  type RenderZoomInProps,
  type RenderZoomOutProps,
} from "@react-pdf-viewer/zoom";
import { pageNavigationPlugin } from "@react-pdf-viewer/page-navigation";
import { Image, List } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileTooLarge } from "@/features/chat/file-preview/renderer-state";
import { isFileTooLarge } from "@/features/chat/file-preview/config";
import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/thumbnail/lib/styles/index.css";
import "@react-pdf-viewer/bookmark/lib/styles/index.css";
import "@react-pdf-viewer/zoom/lib/styles/index.css";
import "@react-pdf-viewer/page-navigation/lib/styles/index.css";
import "@/features/chat/file-preview/renderers/pdf-renderer.css";

/**
 * PDF 渲染器(1:1 对齐旧 dmworkbase PdfRenderer):
 *   - 缩略图 / 书签目录侧栏(默认展开;无书签时书签 tab 禁用)
 *   - 自定义工具栏:页码跳转(左) + 缩放胶囊 + 适应宽度(右)
 *   - 键盘翻页(PageUp/PageDown / ArrowUp/ArrowDown)
 *   - 默认 PageWidth 缩放
 *
 * 超大文件(>20MB)走 FileTooLarge 兜底,不强行让浏览器加载。
 *
 * Worker 走本地 /pdfjs/pdf.worker.min.js(从 pdfjs-dist 拷,版本严格匹配),
 * cmaps 走 /pdfjs/cmaps/(中文字体)。配套 CSS pdf-renderer.css 仅用于覆盖
 * react-pdf-viewer 内部 class(缩略图选中态紫色边框等),其余样式走 Tailwind。
 */

const WORKER_URL = "/pdfjs/pdf.worker.min.js";

type SidebarTab = "thumbnails" | "bookmarks";

// ─── 内联 SVG 图标(对齐旧 IconMenuFold/IconMinus/IconPlus,避免引入整个 icons 文件) ───

function IconMenuFold({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="2 4 20 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21 6.5H3V4.5H21V6.5ZM21 13L11 13V11L21 11V13ZM3 19.5L21 19.5V17.5L3 17.5V19.5ZM7.058 8.99925C7.39068 8.78398 7.82963 9.02278 7.82963 9.41903V14.3751C7.82963 14.7714 7.39068 15.0102 7.058 14.7949L3.22837 12.3169C2.92388 12.1198 2.92388 11.6743 3.22837 11.4773L7.058 8.99925Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconMinus({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.5 8.33333H3V7H12.5V8.33333Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.25 7.25V3H8.25V7.25H12.5V8.25H8.25V12.5H7.25V8.25H3V7.25H7.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PdfRenderer({ file }: BaseRendererProps) {
  const t = useT();
  const isTooLarge = file.size != null && isFileTooLarge(file.size);

  // 侧栏与 tab 状态
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>("thumbnails");
  const [hasBookmarks, setHasBookmarks] = useState(false);

  // 翻页 / 缩放 / 加载状态
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [currentScale, setCurrentScale] = useState(1);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [isLoading, setIsLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);

  // ─── 插件实例(用 ref 保持引用稳定,避免 HMR / Strict Mode 下重复实例化) ───
  const thumbnailPluginRef = useRef(thumbnailPlugin());
  const bookmarkPluginRef = useRef(bookmarkPlugin());
  const zoomPluginRef = useRef(zoomPlugin());
  const pageNavigationPluginRef = useRef(pageNavigationPlugin());

  const thumbnailPluginInstance = thumbnailPluginRef.current;
  const bookmarkPluginInstance = bookmarkPluginRef.current;
  const zoomPluginInstance = zoomPluginRef.current;
  const pageNavigationPluginInstance = pageNavigationPluginRef.current;

  const { Thumbnails } = thumbnailPluginInstance;
  const { Bookmarks } = bookmarkPluginInstance;
  const { ZoomIn: ZoomInButton, ZoomOut: ZoomOutButton } = zoomPluginInstance;
  const { jumpToPage } = pageNavigationPluginInstance;

  const pluginsRef = useRef([
    thumbnailPluginInstance,
    bookmarkPluginInstance,
    zoomPluginInstance,
    pageNavigationPluginInstance,
  ]);
  const plugins = pluginsRef.current;

  // ─── 文档/页码/缩放回调 ─────────────────────────────────
  const handleDocumentLoad = useCallback((e: DocumentLoadEvent) => {
    setTotalPages(e.doc.numPages);
    setIsLoading(false);
    e.doc
      .getOutline()
      .then((outline) => {
        setHasBookmarks(Array.isArray(outline) && outline.length > 0);
      })
      .catch(() => {
        setHasBookmarks(false);
      });
  }, []);

  const handlePageChange = useCallback((e: PageChangeEvent) => {
    setCurrentPage(e.currentPage);
    setPageInputValue(String(e.currentPage + 1));
  }, []);

  const handleZoom = useCallback((e: ZoomEvent) => {
    setCurrentScale(e.scale);
  }, []);

  // ─── 页码输入框 ─────────────────────────────────────────
  const handlePageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setPageInputValue(e.target.value),
    [],
  );

  const commitPageInput = useCallback(() => {
    const pageNumber = parseInt(pageInputValue, 10);
    if (!isNaN(pageNumber) && pageNumber >= 1 && totalPages && pageNumber <= totalPages) {
      jumpToPage(pageNumber - 1);
    } else {
      setPageInputValue(String(currentPage + 1));
    }
  }, [pageInputValue, totalPages, currentPage, jumpToPage]);

  const handlePageInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitPageInput();
    },
    [commitPageInput],
  );

  // ─── 键盘翻页 ───────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }
      if (e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        if (totalPages && currentPage < totalPages - 1) jumpToPage(currentPage + 1);
      } else if (e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        if (currentPage > 0) jumpToPage(currentPage - 1);
      }
    },
    [currentPage, totalPages, jumpToPage],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.tabIndex = 0;
    container.addEventListener("keydown", handleKeyDown);
    return () => container.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ─── 提前返回 ───────────────────────────────────────────
  if (isTooLarge) {
    return <FileTooLarge name={file.name} size={file.size} url={file.url} />;
  }
  if (!file.url) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        {t("filePreview.pdf.loadUnavailable")}
      </div>
    );
  }

  return (
    <Worker workerUrl={WORKER_URL}>
      <div
        ref={containerRef}
        tabIndex={0}
        className="wk-pdf-renderer flex h-full w-full flex-col bg-bg-base outline-none"
      >
        {/* ─── 工具栏(对齐老仓:brand-tint-04 底 / 高 48px / 左右两端) ─── */}
        <div className="flex h-12 shrink-0 items-center gap-4 border-b border-brand-tint-15 bg-brand-tint-04 px-4">
          {/* 左:侧栏切换 — 图标按状态翻转,直观表达开/收 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-icon-muted transition-colors hover:text-text-primary"
                onClick={() => setIsSidebarOpen((s) => !s)}
                aria-label={
                  isSidebarOpen
                    ? t("filePreview.pdf.hideSidebar")
                    : t("filePreview.pdf.showSidebar")
                }
              >
                <span
                  className={`inline-flex transition-transform duration-200 ${
                    isSidebarOpen ? "" : "rotate-180"
                  }`}
                >
                  <IconMenuFold size={20} />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isSidebarOpen ? t("filePreview.pdf.hideSidebar") : t("filePreview.pdf.showSidebar")}
            </TooltipContent>
          </Tooltip>

          {/* 短分隔线(高 12px,圆头) */}
          <span className="h-3 w-px shrink-0 rounded-full bg-border-default" />

          {/* 左:页码导航 */}
          <div className="flex shrink-0 items-center gap-1 text-sm text-text-primary">
            <span>{t("filePreview.pdf.pagePrefix")}</span>
            <input
              type="text"
              value={pageInputValue}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={commitPageInput}
              title={t("filePreview.pdf.jumpToPage")}
              className="h-6 w-8 rounded-sm border border-brand-tint-10 bg-bg-surface px-1.5 py-0.5 text-center text-sm tabular-nums text-text-primary focus:border-brand focus:outline-none"
            />
            <span>{t("filePreview.pdf.pageTotal", { values: { total: totalPages ?? "-" } })}</span>
          </div>

          {/* 右:缩放胶囊 + 适应宽度按钮 */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* 缩放胶囊:白底 + 紫色细边 */}
            <div className="inline-flex h-6 items-center gap-1 rounded-full border border-brand-tint-10 bg-bg-surface px-3 py-1.5">
              <ZoomOutButton>
                {(props: RenderZoomOutProps) => (
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-icon-muted transition-colors hover:text-text-primary"
                    onClick={props.onClick}
                    title={t("filePreview.pdf.zoomOut")}
                  >
                    <IconMinus />
                  </button>
                )}
              </ZoomOutButton>
              <span className="min-w-[36px] text-center text-xs leading-5 font-semibold text-text-primary tabular-nums">
                {Math.round(currentScale * 100)}%
              </span>
              <ZoomInButton>
                {(props: RenderZoomInProps) => (
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-icon-muted transition-colors hover:text-text-primary"
                    onClick={props.onClick}
                    title={t("filePreview.pdf.zoomIn")}
                  >
                    <IconPlus />
                  </button>
                )}
              </ZoomInButton>
            </div>
            {/* 适应宽度按钮:同款胶囊样式 */}
            <button
              type="button"
              className="inline-flex h-6 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border border-brand-tint-10 bg-bg-surface px-3 py-1.5 text-sm leading-5 font-semibold text-text-primary transition-colors hover:bg-bg-hover"
              onClick={() => zoomPluginInstance.zoomTo(SpecialZoomLevel.PageWidth)}
              title={t("filePreview.pdf.fitWidth")}
            >
              {t("filePreview.pdf.fitWidth")}
            </button>
          </div>
        </div>

        {/* ─── 主内容区 ─── */}
        <div className="flex min-h-0 flex-1">
          {/* 侧栏(对齐老仓:160px 宽 / bg-base) */}
          {isSidebarOpen ? (
            <div className="flex w-40 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
              {/* tabs */}
              <div className="flex shrink-0 items-stretch border-b border-border-subtle">
                <SidebarTabBtn
                  active={activeTab === "thumbnails"}
                  onClick={() => setActiveTab("thumbnails")}
                  icon={<Image size={14} />}
                  label={t("filePreview.pdf.thumbnails")}
                />
                <SidebarTabBtn
                  active={activeTab === "bookmarks"}
                  disabled={!hasBookmarks}
                  onClick={() => hasBookmarks && setActiveTab("bookmarks")}
                  icon={<List size={14} />}
                  label={t("filePreview.pdf.directory")}
                  title={
                    hasBookmarks
                      ? t("filePreview.pdf.bookmarkDirectory")
                      : t("filePreview.pdf.noBookmarksShort")
                  }
                />
              </div>
              {/* tab 内容 */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeTab === "thumbnails" ? (
                  <Thumbnails />
                ) : hasBookmarks ? (
                  <div className="p-2">
                    <Bookmarks />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs text-text-tertiary">
                    {t("filePreview.pdf.noBookmarks")}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* PDF 查看器 */}
          <div className="relative min-w-0 flex-1 overflow-auto bg-bg-base">
            {isLoading ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-bg-surface text-sm text-text-secondary">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-brand" />
                <span>{t("filePreview.loading")}</span>
              </div>
            ) : null}
            <Viewer
              fileUrl={file.url}
              plugins={plugins}
              onDocumentLoad={handleDocumentLoad}
              onPageChange={handlePageChange}
              onZoom={handleZoom}
              defaultScale={SpecialZoomLevel.PageWidth}
              characterMap={{
                url: "/pdfjs/cmaps/",
                isCompressed: true,
              }}
              renderError={(error) => (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-sm text-error">{t("filePreview.pdf.loadFailed")}</span>
                  <span className="text-xs text-text-tertiary">
                    {error.message || t("filePreview.pdf.invalidFileHint")}
                  </span>
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </Worker>
  );
}

/**
 * 侧栏 tab 按钮(对齐老仓:active 紫色字 + 紫色 2px 下划线)。
 */
function SidebarTabBtn({
  active,
  disabled,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1 border-0 bg-transparent px-2 py-2 text-xs transition-colors ${
        active
          ? "font-medium text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      } ${disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-text-secondary" : ""}`}
    >
      {icon}
      <span>{label}</span>
      {active ? (
        <span className="absolute right-0 -bottom-px left-0 h-0.5 bg-text-primary" aria-hidden />
      ) : null}
    </button>
  );
}
