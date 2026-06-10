import { useCallback, useEffect, useMemo, useState } from "react";
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
  matterTitle?: string;
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

/**
 * 关联新群聊弹窗（双栏布局，对齐原始项目 LinkChannelsModal）。
 *
 * - 左栏：候选列表（群 + 子区），支持搜索
 * - 右栏：已选列表，可单独移除
 * - 支持多选后批量关联
 */
export function LinkChannelModal({
  open,
  matterId,
  matterTitle,
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

  // modal 打开时重置 UI 状态并加载候选列表
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelected([]);
      setThreadLoadErrors([]);
      return;
    }
    // 加载候选列表
    if (!spaceId) return;
    setLoading(true);
    setThreadLoadErrors([]);
    buildLinkableChannels(spaceId, {
      unnamedThreadName: t("matter.linkChannels.unnamedThread"),
    })
      .then((res: LoadChannelsResult) => {
        setChannels(res.channels);
        setThreadLoadErrors(res.threadLoadErrors ?? []);
        // reload 后对账 selected
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, spaceId]);

  // 已关联的 channel_id 集合
  const linkedIds = useMemo(
    () => new Set(linkedChannels.map((c) => c.channel_id)),
    [linkedChannels],
  );

  // 搜索匹配：匹配 name / desc / 子区父群名
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

  // 列表过长时截断渲染
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, submitting, channels, matterId, linkMu, onClose]);

  const reload = useCallback(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedChannels = useMemo(
    () => channels.filter((c) => selectedSet.has(c.channelId)),
    [channels, selectedSet],
  );

  const content = (
    <div className="flex h-full flex-col">
      {/* Content: 左右双栏 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左栏：候选列表 */}
        <div className="flex w-[360px] flex-col border-r border-border-subtle">
          {/* 搜索框 */}
          <div className="shrink-0 px-3 py-2">
            <div className="relative">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="absolute top-1/2 left-2.5 -translate-y-1/2 text-text-tertiary"
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
                className="h-8 w-full rounded-md border border-border-subtle bg-bg-elevated pl-8 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
                placeholder={t("matter.linkChannels.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* 子区加载警告条 */}
          {!loading && threadLoadErrors.length > 0 && (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning text-[10px] font-bold text-white">
                !
              </span>
              <span className="flex-1">
                {threadLoadErrors.length === 1
                  ? t("matter.linkChannels.threadLoadFailedOne", {
                      values: { name: threadLoadErrors[0] },
                    })
                  : threadLoadErrors.length <= ERROR_NAME_PREVIEW_LIMIT
                    ? t("matter.linkChannels.threadLoadFailedNamed", {
                        values: {
                          names: threadLoadErrors.map((n) => `"${n}"`).join(", "),
                        },
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
                className="shrink-0 text-xs font-medium text-accent hover:underline"
                onClick={reload}
                disabled={loading}
              >
                {t("matter.common.retry")}
              </button>
            </div>
          )}

          {/* 列表 */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {loading ? (
              <div className="py-8 text-center text-sm text-text-tertiary">
                {t("matter.state.loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-tertiary">
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
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected ? "bg-accent/5" : ""
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isLinked
                            ? "border-border-default bg-bg-elevated"
                            : isSelected
                              ? "border-accent bg-accent text-white"
                              : "border-border-default bg-bg-base"
                        }`}
                      >
                        {(isLinked || isSelected) && (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <ChannelAvatar channel={avatarChannel} size={32} title={c.name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-0.5 text-sm text-text-primary">
                          {isThread && (
                            <span className="text-text-tertiary" aria-hidden="true">
                              #
                            </span>
                          )}
                          <span className="truncate">{c.name}</span>
                        </span>
                        {isThread && c.parentGroupName && (
                          <span className="block truncate text-xs text-text-tertiary">
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
                  <div className="py-2 text-center text-xs text-text-tertiary">
                    {t("matter.linkChannels.overflowHint", {
                      values: {
                        limit: VISIBLE_ROW_LIMIT,
                        total: filtered.length,
                      },
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 右栏：已选列表 */}
        <div className="flex w-[240px] flex-col">
          <div className="shrink-0 border-b border-border-subtle px-4 py-2 text-xs font-medium text-text-secondary">
            {t("matter.linkChannels.selectedCount", { values: { count: selected.length } })}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {selectedChannels.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-tertiary">
                {t("matter.linkChannels.noSelection")}
              </div>
            ) : (
              selectedChannels.map((c) => {
                const isThread = c.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC;
                const avatarChannel = channelForAvatar(c);
                return (
                  <div key={c.channelId} className="flex items-center gap-2 rounded-md px-2 py-2">
                    <ChannelAvatar channel={avatarChannel} size={32} title={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-0.5 text-sm text-text-primary">
                        {isThread && (
                          <span className="text-text-tertiary" aria-hidden="true">
                            #
                          </span>
                        )}
                        <span className="truncate">{c.name}</span>
                      </span>
                      {isThread && c.parentGroupName && (
                        <span className="block truncate text-xs text-text-tertiary">
                          {t("matter.linkChannels.inParentGroup", {
                            values: { name: c.parentGroupName },
                          })}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
                      onClick={() => removeSelected(c.channelId)}
                      aria-label={t("matter.action.remove")}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
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
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="h-8 rounded-md px-4 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
      >
        {t("matter.common.cancel")}
      </button>
      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={submitting || selected.length === 0}
        className="h-8 rounded-md bg-accent px-4 text-sm text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting
          ? t("matter.linkChannels.linking")
          : t("matter.linkChannels.confirm", { values: { count: selected.length } })}
      </button>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="xl"
      height="lg"
      title={`${t("matter.linkChannels.title")}${matterTitle ? ` · ${matterTitle}` : ""}`}
      description={t("matter.linkChannels.description")}
      footer={footer}
    >
      {content}
    </BaseDialog>
  );
}
