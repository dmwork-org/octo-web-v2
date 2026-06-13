import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useLinkChannel } from "@/features/matter/mutations/matters.mutation";
import { useT } from "@/lib/i18n/use-t";
import type { MatterChannel } from "@/features/matter/types/matter.types";
import {
  buildLinkableChannels,
  type ChannelOption,
  type LoadChannelsResult,
} from "@/features/matter/utils/build-linkable-channels";
import { toast } from "@/components/semi-bridge/toast";

/** 列表硬性渲染上限 */
const VISIBLE_ROW_LIMIT = 200;

/** 子区加载失败时，警告条最多列出几个父群名 */
const ERROR_NAME_PREVIEW_LIMIT = 3;

/** 子区类型常量 */
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

interface LinkChannelModalProps {
  open: boolean;
  matterId: string;
  /** 已关联的群聊列表，用于过滤重复 */
  linkedChannels: MatterChannel[];
  onClose: () => void;
}

/** 构造头像用的 Channel：子区头像复用父群头像 */
function channelForAvatar(c: ChannelOption): Channel {
  if (c.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC && c.parentGroupNo) {
    return new Channel(c.parentGroupNo, ChannelTypeGroup);
  }
  return new Channel(c.channelId, c.channelType);
}

function useLoadChannelsOnOpen({
  open,
  spaceId,
  loadChannels,
  setSearch,
  setSelected,
  setThreadLoadErrors,
}: {
  open: boolean;
  spaceId: string | null;
  loadChannels: () => void;
  setSearch: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<string[]>>;
  setThreadLoadErrors: Dispatch<SetStateAction<string[]>>;
}): void {
  // loadChannels 依赖 useT() 的 t —— t 每次 render 都是新引用,导致 loadChannels
  // 引用每次都变。若把它列入 effect 依赖,effect 会每次 render 重跑,而 effect 内的
  // setSelected([]) / setThreadLoadErrors([]) 每次都产生新数组引用触发重渲染 →
  // 无限循环(Maximum update depth exceeded)。
  // 用 ref 持有最新 loadChannels,effect 只依赖 [open, spaceId],仅在开关/Space
  // 变化时执行。
  const loadChannelsRef = useRef(loadChannels);
  loadChannelsRef.current = loadChannels;

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected([]);
      setThreadLoadErrors([]);
      return;
    }
    loadChannelsRef.current();
    // setSearch/setSelected/setThreadLoadErrors 是 useState 的 dispatch,引用稳定,
    // 无需列入依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spaceId]);
}

/**
 * 关联会话弹窗（严格对齐原始项目 LinkChannelsModal）。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────┐
 *   │  关联会话                              ✕    │  header (border-b)
 *   ├──────────────────┬──────────────────────────┤
 *   │ 🔍 搜索…         │  已选 2 个会话            │
 *   │ ☑ 群A            │  [头像] 群A          ✕   │
 *   │ ☑ #子区1 (在群A) │  [头像] #子区1       ✕   │
 *   │ ☐ 群B            │                          │
 *   │   ☐ #子区2 (在群B)│                          │
 *   ├──────────────────┴──────────────────────────┤
 *   │                        [取消]  [关联 (2)]   │  footer
 *   └─────────────────────────────────────────────┘
 */
export function LinkChannelModal({
  open,
  matterId,
  linkedChannels,
  onClose,
}: LinkChannelModalProps) {
  const t = useT();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const linkMu = useLinkChannel();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [threadLoadErrors, setThreadLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── 加载候选列表 ──
  const loadChannels = useCallback(() => {
    if (!spaceId) return;
    setLoading(true);
    setThreadLoadErrors([]);
    buildLinkableChannels(spaceId, {
      unnamedThreadName: t("matter.linkChannels.unnamedThread"),
    })
      .then((res: LoadChannelsResult) => {
        setChannels(res.channels);
        setThreadLoadErrors(res.threadLoadErrors ?? []);
        const validIds = new Set(res.channels.map((c) => c.channelId));
        setSelected((prev) => {
          const next = prev.filter((id) => validIds.has(id));
          return next.length === prev.length ? prev : next;
        });
      })
      .catch(() => {
        toast.error(t("matter.linkChannels.loadFailedRetry"));
      })
      .finally(() => setLoading(false));
  }, [spaceId, t]);

  useLoadChannelsOnOpen({
    open,
    spaceId,
    loadChannels,
    setSearch,
    setSelected,
    setThreadLoadErrors,
  });

  // 已关联的 channel_id 集合
  const linkedIds = useMemo(
    () => new Set(linkedChannels.map((c) => c.channel_id)),
    [linkedChannels],
  );

  // 搜索匹配
  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return channels;
    return channels.filter((c) => {
      if (c.name.toLowerCase().includes(kw)) return true;
      if (c.desc && c.desc.toLowerCase().includes(kw)) return true;
      if (c.parentGroupName && c.parentGroupName.toLowerCase().includes(kw)) return true;
      return false;
    });
  }, [channels, search]);

  const overflowing = filtered.length > VISIBLE_ROW_LIMIT;
  const visibleRows = overflowing ? filtered.slice(0, VISIBLE_ROW_LIMIT) : filtered;

  const toggle = (channelId: string) => {
    if (linkedIds.has(channelId)) return;
    setSelected((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  };

  const removeSelected = (channelId: string) => {
    setSelected((prev) => prev.filter((id) => id !== channelId));
  };

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    let linkedCount = 0;
    try {
      for (const chId of selected) {
        const ch = channels.find((c) => c.channelId === chId);
        if (!ch) continue;
        await linkMu.mutateAsync({
          matterId,
          req: {
            channel_id: ch.channelId,
            channel_type: ch.channelType,
            channel_name: ch.name,
          },
        });
        linkedCount++;
      }
      if (linkedCount === 0) {
        toast.error(t("matter.linkChannels.selectionUnavailable"));
        return;
      }
      toast.success(t("matter.linkChannels.linked", { values: { count: linkedCount } }));
      onClose();
    } catch (err: unknown) {
      toast.error((err as Error)?.message || t("matter.linkChannels.failed"));
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, channels, matterId, linkMu, onClose, t]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedChannels = useMemo(
    () => channels.filter((c) => selectedSet.has(c.channelId)),
    [channels, selectedSet],
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      hideHeader
      size="fit"
      height="auto"
      title={t("matter.linkChannels.title")}
      description={t("matter.linkChannels.description")}
      className="w-[625px] !max-w-[625px]"
    >
      <div className="flex h-[560px] flex-col">
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: "1px solid rgba(28,28,35,0.15)" }}
        >
          <span className="text-[18px] font-semibold leading-[24px] text-text-primary">
            {t("matter.linkChannels.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary focus:outline-none"
            aria-label={t("base.common.close")}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Content (双栏) ── */}
        <div
          className="flex flex-1 min-h-0 px-4"
          style={{ borderBottom: "1px solid rgba(28,28,35,0.15)" }}
        >
          {/* ── 左栏：候选列表 ── */}
          <div
            className="flex w-[296px] flex-col gap-1 py-2"
            style={{ borderRight: "1px solid rgba(28,28,35,0.15)" }}
          >
            {/* 搜索框 */}
            <div className="pr-4">
              <div className="flex h-9 items-center gap-2 rounded-full bg-bg-item-hover px-3">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="shrink-0 text-icon-muted"
                >
                  <circle cx="7.33" cy="7.33" r="5" stroke="currentColor" strokeWidth="1.33" />
                  <path
                    d="M11 11l3 3"
                    stroke="currentColor"
                    strokeWidth="1.33"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  className="flex-1 border-none bg-transparent text-[14px] leading-[20px] text-text-primary outline-none placeholder:text-icon-muted"
                  placeholder={t("matter.linkChannels.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* 子区加载警告条 */}
            {!loading && threadLoadErrors.length > 0 && (
              <div
                className="mx-4 mb-2 flex items-center gap-2 rounded-sm border px-3 py-2 text-[12px] leading-[18px]"
                style={{ borderColor: "#f5a623", background: "rgba(245,166,35,0.08)" }}
              >
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: "#f5a623" }}
                >
                  !
                </span>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: "#f5a623" }}
                >
                  !
                </span>
                <span className="min-w-0 flex-1 break-words text-text-primary">
                  {threadLoadErrors.length === 1
                    ? t("matter.linkChannels.threadLoadFailedOne", {
                        values: { name: threadLoadErrors[0] },
                      })
                    : threadLoadErrors.length <= ERROR_NAME_PREVIEW_LIMIT
                      ? t("matter.linkChannels.threadLoadFailedNamed", {
                          values: { names: threadLoadErrors.map((n) => `"${n}"`).join(", ") },
                        })
                      : t("matter.linkChannels.threadLoadFailedMany", {
                          values: {
                            count: threadLoadErrors.length,
                            names: threadLoadErrors
                              .slice(0, ERROR_NAME_PREVIEW_LIMIT)
                              .map((n) => `"${n}"`)
                              .join(", "),
                          },
                        })}
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-sm border px-2 py-0.5 text-[12px] font-medium transition-colors hover:bg-[#f5a623] hover:text-white"
                  style={{ borderColor: "#f5a623", color: "#f5a623" }}
                  onClick={loadChannels}
                  disabled={loading}
                >
                  {t("matter.common.retry")}
                </button>
              </div>
            )}

            {/* 列表 */}
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
              {loading ? (
                <div className="py-8 text-center text-[14px] text-text-tertiary">
                  {t("matter.state.loading")}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-[14px] text-text-tertiary">
                  {t("matter.linkChannels.noMatches")}
                </div>
              ) : (
                <>
                  {visibleRows.map((c) => {
                    const isLinked = linkedIds.has(c.channelId);
                    const isSelected = selectedSet.has(c.channelId);
                    const isThread = c.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC;
                    const avatarChannel = channelForAvatar(c);
                    return (
                      <button
                        key={c.channelId}
                        type="button"
                        disabled={isLinked}
                        onClick={() => toggle(c.channelId)}
                        className={`flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors hover:bg-bg-item-hover ${
                          isLinked ? "cursor-not-allowed opacity-50" : ""
                        } ${isThread ? "pl-6" : ""}`}
                      >
                        {/* Checkbox */}
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-[1.5px] transition-all ${
                            isLinked
                              ? "border-text-tertiary bg-text-tertiary"
                              : isSelected
                                ? "border-accent bg-accent"
                                : "border-border-default"
                          }`}
                        >
                          {(isLinked || isSelected) && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                        {/* Avatar */}
                        <ChannelAvatar channel={avatarChannel} size={32} title={c.name} />
                        {/* Info */}
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-[14px] leading-[20px] text-text-primary">
                            {isThread && (
                              <span
                                className="mr-0.5 font-medium text-text-tertiary"
                                aria-hidden="true"
                              >
                                #
                              </span>
                            )}
                            {c.name}
                          </span>
                          {isThread && c.parentGroupName && (
                            <span className="truncate text-[12px] leading-[16px] text-text-tertiary">
                              {t("matter.linkChannels.inParentGroup", {
                                values: { name: c.parentGroupName },
                              })}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {overflowing && (
                    <div className="mt-1 border-t border-dashed border-border-default py-2 text-center text-[12px] text-text-tertiary px-2">
                      {t("matter.linkChannels.overflowHint", {
                        values: { limit: VISIBLE_ROW_LIMIT, total: filtered.length },
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── 右栏：已选列表 ── */}
          <div className="flex w-[296px] flex-col gap-1 overflow-y-auto py-2 pl-2">
            <div className="px-2 py-1 text-[14px] font-medium leading-[20px] text-icon-muted">
              {t("matter.linkChannels.selectedCount", { values: { count: selected.length } })}
            </div>
            {selectedChannels.map((c) => {
              const isThread = c.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC;
              const avatarChannel = channelForAvatar(c);
              return (
                <div key={c.channelId} className="flex items-center gap-2 px-2 py-1">
                  <ChannelAvatar channel={avatarChannel} size={32} title={c.name} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[14px] leading-[20px] text-text-primary">
                      {isThread && (
                        <span className="mr-0.5 font-medium text-text-tertiary" aria-hidden="true">
                          #
                        </span>
                      )}
                      {c.name}
                    </span>
                    {isThread && c.parentGroupName && (
                      <span className="truncate text-[12px] leading-[16px] text-text-tertiary">
                        {t("matter.linkChannels.inParentGroup", {
                          values: { name: c.parentGroupName },
                        })}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-item-hover hover:text-text-primary"
                    onClick={() => removeSelected(c.channelId)}
                    aria-label={t("matter.action.remove")}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-3 px-4 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center gap-2 rounded-full border bg-bg-surface px-3 text-[12px] font-semibold leading-[20px] text-text-primary transition-colors hover:bg-bg-item-hover"
            style={{ borderColor: "rgba(28,28,35,0.1)" }}
          >
            {t("matter.common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || selected.length === 0}
            className="inline-flex h-7 items-center gap-2 rounded-full bg-brand px-3 text-[12px] font-semibold leading-[20px] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? t("matter.linkChannels.linking")
              : selected.length > 0
                ? `${t("matter.linkChannels.confirm")} (${selected.length})`
                : t("matter.linkChannels.confirm")}
          </button>
        </div>
      </div>
    </BaseDialog>
  );
}
