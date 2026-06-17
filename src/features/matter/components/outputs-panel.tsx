import { useState, useCallback, useRef, useEffect } from "react";
import { FileWarning } from "lucide-react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { UserName } from "@/features/matter/components/user-name";
import { getFileIcon, formatFileSize } from "@/features/matter/utils/file-utils";
import { useT } from "@/lib/i18n/use-t";
import type { MatterOutput } from "@/features/matter/types/matter.types";

// ─── Action icons (16x16, stroke = currentColor, 对齐老项目 SVG) ────

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.33 8s2.4-4.67 6.67-4.67S14.67 8 14.67 8 12.27 12.67 8 12.67 1.33 8 1.33 8z"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.33" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 10v3.33a1.33 1.33 0 01-1.33 1.34H3.33A1.33 1.33 0 012 13.33V10M4.67 6.67L8 10l3.33-3.33M8 10V2"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Props ──────────────────────────────────────────────

interface OutputChannelMembership {
  isMember: boolean;
  loading: boolean;
}

export interface OutputsPanelProps {
  outputs: MatterOutput[];
  loading?: boolean;
  hasMore?: boolean;
  query?: string;
  error?: string | null;
  onLoadMore?: () => void;
  onSearch?: (query: string) => void;
  onRetry?: () => void;
  /** 文件预览回调，传入时操作列显示眼睛按钮 */
  onPreview?: (item: MatterOutput) => void;
  /** 文件下载回调，传入时操作列显示下载按钮 */
  onDownload?: (item: MatterOutput) => void;
  getChannelMembership?: (sourceChannelId?: string) => OutputChannelMembership;
  resolveChannelName?: (sourceChannelId?: string) => string | undefined;
}

// ─── Helpers ────────────────────────────────────────────

function formatOutputDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function useSyncSearchValue(
  query: string,
  setSearchValue: (updater: (prev: string) => string) => void,
): void {
  useEffect(() => {
    setSearchValue((prev) => (prev.trim() === query ? prev : query));
  }, [query, setSearchValue]);
}

function useClearPendingSearchTimer(
  searchTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  onSearch: OutputsPanelProps["onSearch"],
  query: string,
): void {
  useEffect(() => {
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
        searchTimer.current = null;
      }
    };
  }, [searchTimer, onSearch, query]);
}

// ─── Component ──────────────────────────────────────────

export function OutputsPanel({
  outputs,
  loading,
  hasMore,
  query = "",
  error,
  onLoadMore,
  onSearch,
  onRetry,
  onPreview,
  onDownload,
  getChannelMembership,
  resolveChannelName,
}: OutputsPanelProps) {
  const t = useT();

  // ── 搜索: controlled input + 300ms debounce (对齐老项目) ──
  const [searchValue, setSearchValue] = useState(query);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSyncSearchValue(query, setSearchValue);
  useClearPendingSearchTimer(searchTimer, onSearch, query);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchValue(val);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        onSearch?.(val.trim());
      }, 300);
    },
    [onSearch],
  );

  const handlePreview = useCallback(
    (e: React.MouseEvent, item: MatterOutput) => {
      e.preventDefault();
      e.stopPropagation();
      onPreview?.(item);
    },
    [onPreview],
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent, item: MatterOutput) => {
      e.preventDefault();
      e.stopPropagation();
      onDownload?.(item);
    },
    [onDownload],
  );

  const showInitialSkeleton = loading && outputs.length === 0 && !error;
  const isEmpty = outputs.length === 0 && !showInitialSkeleton && !error;
  const emptyText = query ? t("matter.outputs.emptySearch") : t("matter.outputs.emptyDefault");

  return (
    <div>
      {/* 搜索栏 */}
      {onSearch && (
        <div className="relative mb-3 flex h-7 max-w-[400px] items-center overflow-hidden rounded-full bg-bg-elevated px-3 focus-within:bg-bg-hover">
          <svg
            className="shrink-0 text-text-tertiary"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7.333 12.667a5.333 5.333 0 100-10.667 5.333 5.333 0 000 10.667zM14 14l-2.9-2.9"
              stroke="currentColor"
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="text"
            className="ml-2 h-full min-w-0 flex-1 border-0 bg-transparent text-sm leading-5 text-text-primary outline-none placeholder:text-text-tertiary"
            placeholder={t("matter.outputs.searchPlaceholder")}
            aria-label={t("matter.outputs.searchAriaLabel")}
            value={searchValue}
            onChange={handleSearchChange}
          />
        </div>
      )}

      {/* 表格 */}
      <div className="w-full overflow-x-auto pb-1" role="table">
        {/* 表头 */}
        <div className="inline-flex h-8 min-w-full items-stretch bg-bg-elevated" role="row">
          <div
            className="flex w-[216px] shrink-0 items-center px-3 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.title")}
          </div>
          <div
            className="flex w-[312px] shrink-0 items-center px-3 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.description")}
          </div>
          <div
            className="flex w-[144px] shrink-0 items-center px-3 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.sender")}
          </div>
          <div
            className="flex w-[148px] shrink-0 items-center px-3 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.sourceGroup")}
          </div>
          <div
            className="flex w-[172px] shrink-0 items-center px-3 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.sentAt")}
          </div>
          <div
            className="flex w-[88px] shrink-0 items-center px-4 text-[12px] font-medium leading-4 text-text-tertiary"
            role="columnheader"
          >
            {t("matter.outputs.column.actions")}
          </div>
        </div>

        <div>
          {/* 错误状态 */}
          {error ? (
            <div
              className="flex min-h-[186px] flex-col items-center justify-center gap-2 border-b border-border-subtle py-10 text-sm text-text-tertiary"
              role="alert"
            >
              <FileWarning size={40} className="opacity-40" />
              <span>{error}</span>
              {onRetry && (
                <button
                  type="button"
                  className="mt-1 cursor-pointer rounded border border-border-default px-3 py-1 text-sm text-text-tertiary transition-colors hover:text-text-primary"
                  onClick={onRetry}
                >
                  {t("matter.outputs.retry")}
                </button>
              )}
            </div>
          ) : isEmpty ? (
            /* 空状态 */
            <div className="flex min-h-[186px] flex-col items-center justify-center gap-2 border-b border-border-subtle py-10 text-sm text-text-tertiary">
              <FileWarning size={40} className="opacity-40" />
              <span>{emptyText}</span>
            </div>
          ) : (
            /* 数据行 */
            outputs.map((item) => {
              const iconUrl = getFileIcon(item.file_name || "", item.mime_type || "");
              return (
                <div
                  key={item.id}
                  className="inline-flex h-[62px] min-w-full items-stretch border-b border-border-default bg-bg-surface transition-colors hover:bg-bg-hover"
                  role="row"
                >
                  {/* 标题列: 缩略图 + 文件名 + 大小 */}
                  <div
                    className="flex w-[216px] shrink-0 items-center gap-1 px-3 text-sm leading-5 text-text-primary"
                    role="cell"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <img src={iconUrl} alt="" width={32} height={32} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <div
                        className="overflow-hidden text-ellipsis whitespace-nowrap"
                        title={item.file_name || ""}
                      >
                        {item.file_name || t("matter.outputs.unnamedFile")}
                      </div>
                      {/* 文件大小:后端返回 file_size 才显示(0 字节是合法值);
                          缺失时整行不渲染,避免难看的占位横杠。后端补数据后自动恢复。 */}
                      {item.file_size != null ? (
                        <div className="text-[12px] leading-[18px] text-text-tertiary">
                          {formatFileSize(item.file_size)}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* 描述列: 最多2行截断 */}
                  <div
                    className="flex w-[312px] shrink-0 items-center px-3 text-sm leading-5 text-text-primary"
                    role="cell"
                    title={item.description || ""}
                  >
                    <span className="line-clamp-2 break-words">{item.description || ""}</span>
                  </div>

                  {/* 发送人列: 头像 + 姓名 */}
                  <div
                    className="flex w-[144px] shrink-0 items-center gap-1 px-3 text-sm leading-5 text-text-primary"
                    role="cell"
                  >
                    <ChannelAvatar
                      channel={new Channel(item.sender_uid, ChannelTypePerson)}
                      size={20}
                      title={item.sender_uid}
                    />
                    <UserName
                      uid={item.sender_uid}
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    />
                  </div>

                  {/* 来源群列 */}
                  <div
                    className="flex w-[148px] shrink-0 items-center px-3 text-sm leading-5 text-text-primary"
                    role="cell"
                  >
                    <ChannelCell
                      item={item}
                      getChannelMembership={getChannelMembership}
                      resolveChannelName={resolveChannelName}
                    />
                  </div>

                  {/* 发送时间列 */}
                  <div
                    className="flex w-[172px] shrink-0 items-center px-3 text-sm leading-5 text-text-primary tabular-nums"
                    role="cell"
                  >
                    {formatOutputDateTime(item.sent_at)}
                  </div>

                  {/* 操作列: (可选)预览 + (可选)下载 */}
                  <div className="flex w-[88px] shrink-0 items-center gap-4 px-4" role="cell">
                    {onPreview && (
                      <button
                        type="button"
                        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={t("matter.outputs.preview")}
                        title={t("matter.outputs.preview")}
                        onClick={(e) => handlePreview(e, item)}
                      >
                        <EyeIcon />
                      </button>
                    )}
                    {onDownload && (
                      <button
                        type="button"
                        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
                        aria-label={t("matter.outputs.download")}
                        title={t("matter.outputs.download")}
                        onClick={(e) => handleDownload(e, item)}
                      >
                        <DownloadIcon />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* 加载骨架 */}
          {showInitialSkeleton && (
            <div className="flex flex-col">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[62px] min-w-full animate-pulse border-b border-border-default bg-bg-elevated"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <button
          type="button"
          className="mt-2 w-full cursor-pointer rounded-sm border border-dashed border-border-default py-2 text-sm text-text-tertiary transition-colors hover:border-text-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? t("matter.outputs.loading") : t("matter.outputs.loadMore")}
        </button>
      )}
    </div>
  );
}

// ─── 来源群单元格 ────────────────────────────────────────

function ChannelCell({
  item,
  getChannelMembership,
  resolveChannelName,
}: {
  item: MatterOutput;
  getChannelMembership?: (sourceChannelId?: string) => OutputChannelMembership;
  resolveChannelName?: (sourceChannelId?: string) => string | undefined;
}) {
  const t = useT();
  const m = getChannelMembership?.(item.source_channel_id);
  const loadingMembership = m?.loading ?? false;
  const isMember = m?.isMember ?? true;

  const resolvedName =
    resolveChannelName?.(item.source_channel_id) || item.source_channel_name || "";

  if (loadingMembership) {
    return (
      <span
        className="inline-block h-3.5 min-w-16 animate-pulse rounded bg-bg-elevated align-baseline"
        aria-label={t("matter.outputs.loadingMembership")}
      />
    );
  }

  if (!isMember && resolvedName) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span
          className="inline-block cursor-help select-none tracking-wider opacity-35 blur-[2.5px]"
          title={t("matter.outputs.notInGroupTitle")}
          aria-label={t("matter.outputs.groupNameHidden")}
        >
          ████
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-border-default bg-bg-elevated px-1.5 py-0.5 text-[11px] font-medium text-text-tertiary">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          {t("matter.outputs.notInGroup")}
        </span>
      </span>
    );
  }

  return (
    <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={resolvedName}>
      {resolvedName ? `#${resolvedName}` : "—"}
    </span>
  );
}
