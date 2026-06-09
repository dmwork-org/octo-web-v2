import { useEffect, useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useLinkChannel } from "@/features/matter/mutations/matters.mutation";
import { myGroupsQueryOptions } from "@/features/matter/queries/matters.query";
import type { LinkChannelReq, MatterChannel } from "@/features/matter/types/matter.types";

interface LinkChannelModalProps {
  open: boolean;
  matterId: string;
  matterTitle?: string;
  /** 已关联的群聊列表，用于过滤重复 */
  linkedChannels: MatterChannel[];
  onClose: () => void;
}

/** modal 打开时重置 UI 状态 */
function useResetOnOpen(
  open: boolean,
  setKeyword: (v: string) => void,
  setSelected: (v: Set<string>) => void,
) {
  useEffect(() => {
    if (open) {
      setKeyword("");
      setSelected(new Set());
    }
  }, [open, setKeyword, setSelected]);
}

/**
 * 关联新群聊弹窗。
 *
 * - 打开时通过 useQuery(enabled: open) 拉取当前用户加入的群列表
 * - 过滤掉已关联的群
 * - 支持按名称搜索
 * - 多选后并行批量关联
 */
export function LinkChannelModal({
  open,
  matterId,
  matterTitle,
  linkedChannels,
  onClose,
}: LinkChannelModalProps) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const linkMu = useLinkChannel();

  const { data: groups = [], isLoading: loading } = useQuery(myGroupsQueryOptions(spaceId, open));

  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useResetOnOpen(open, setKeyword, setSelected);

  // 已关联的 channel_id 集合，用于过滤
  const linkedIds = useMemo(
    () => new Set(linkedChannels.map((c) => c.channel_id)),
    [linkedChannels],
  );

  // Channel 实例缓存：group_no → Channel
  const channelMap = useMemo(
    () =>
      new Map(groups.map((g) => [g.group_no, new Channel(g.group_no, ChannelTypeGroup)] as const)),
    [groups],
  );

  // 过滤：排除已关联 + 关键词搜索
  const filtered = groups.filter((g) => {
    if (linkedIds.has(g.group_no)) return false;
    if (keyword.trim()) {
      return g.name.toLowerCase().includes(keyword.trim().toLowerCase());
    }
    return true;
  });

  const toggleSelect = (groupNo: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(groupNo)) {
        next.delete(groupNo);
      } else {
        next.add(groupNo);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      // 从完整 groups（而非 filtered）过滤选中项，避免搜索导致选中项丢失
      const reqs: LinkChannelReq[] = groups
        .filter((g) => selected.has(g.group_no))
        .map((g) => ({
          channel_id: g.group_no,
          channel_type: ChannelTypeGroup,
          channel_name: g.name,
        }));

      // 并行提交，useLinkChannel 的 onSuccess 会 invalidate detail + list
      const results = await Promise.allSettled(
        reqs.map((req) => linkMu.mutateAsync({ matterId, req })),
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        // 部分失败时仍关闭弹窗（成功的已生效），错误 toast 由全局拦截器处理
        console.warn(`关联群聊：${failed}/${results.length} 个请求失败`);
      }
    } finally {
      setSubmitting(false);
    }
    onClose();
  };

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="h-8 rounded-md px-4 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
      >
        取消
      </button>
      <button
        type="button"
        onClick={() => void handleConfirm()}
        disabled={submitting || selected.size === 0}
        className="h-8 rounded-md bg-brand px-4 text-sm text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
      >
        {submitting ? "关联中…" : `关联 ${selected.size > 0 ? `(${selected.size})` : ""}`}
      </button>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      size="sm"
      height="md"
      title={`关联群聊${matterTitle ? ` · ${matterTitle}` : ""}`}
      description="选择要关联到该事项的群聊"
      footer={footer}
    >
      {/* 搜索框 */}
      <div className="relative mb-3 shrink-0">
        <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索群聊名称…"
          aria-label="搜索群聊名称"
          className="h-8 w-full rounded-md border border-border-subtle bg-bg-elevated pl-8 pr-3 text-sm text-text-primary placeholder:text-text-placeholder focus:border-brand focus:outline-none"
        />
      </div>

      {/* 群列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-sm text-text-tertiary">加载中…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-tertiary">
            {keyword ? "没有匹配的群聊" : "暂无可关联的群聊"}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((g) => {
              const isChecked = selected.has(g.group_no);
              const ch = channelMap.get(g.group_no)!;
              return (
                <li key={g.group_no}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => toggleSelect(g.group_no)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-hover ${
                      isChecked ? "bg-brand/5" : ""
                    }`}
                  >
                    {/* 复选框 */}
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        isChecked
                          ? "border-brand bg-brand text-white"
                          : "border-border-default bg-bg-base"
                      }`}
                    >
                      {isChecked ? (
                        <svg
                          width="10"
                          height="8"
                          viewBox="0 0 10 8"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    {/* 群头像 */}
                    <ChannelAvatar channel={ch} size={28} title={g.name} />
                    {/* 群名 */}
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {g.name}
                    </span>
                    {g.member_count != null ? (
                      <span className="shrink-0 text-[11px] text-text-tertiary">
                        {g.member_count} 人
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BaseDialog>
  );
}
