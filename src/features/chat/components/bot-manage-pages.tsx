import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, Sparkles, ToggleLeft } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { SectionGroup } from "@/features/base/components/section-form/section-group";
import {
  deleteRobotMentionPref,
  listRobotGroups,
  setRobotMentionPref,
  type RobotGroupItem,
  type RobotGroupListResp,
} from "@/features/base/api/endpoints/robot-mention-pref.api";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

/**
 * Bot 管理两个 page 组件(对齐上游 e7c5e0be / #235),供 bot-detail-modal 用
 * DrilldownDialog 嵌套渲染:
 *
 *   L1 BotDetailModal(既有 detail page)
 *     └─ push → L2 BotManageMenuPage(本文件 export)
 *          └─ push → L3 MentionFreeListPage(本文件 export)
 *
 * 不再独立暴露 modal 壳(之前的 BotManageModal 已删除)— modal 壳由 bot-detail
 * 一个 DrilldownDialog 统一承载,避免"中央 BaseDialog + 右侧 BaseDrawer 形态割裂"。
 *
 * 防竞态:React Query key 含 robotId + q,bot 切换或 q 变化自动 invalidate 旧请求,
 * 不需要上游手写的 generation 世代号 vm。
 */

export function BotManageMenuPage({ onPickMentionFree }: { onPickMentionFree: () => void }) {
  const tt = useT();
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <button
        type="button"
        onClick={onPickMentionFree}
        className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-base px-4 py-3 text-left transition-colors hover:bg-bg-hover"
      >
        <Sparkles size={18} className="shrink-0 text-brand" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-medium text-text-primary">
            {tt("base.botManage.menu.mentionFree")}
          </span>
          <span className="text-[12px] text-text-tertiary">
            {tt("base.botManage.menu.mentionFreeHint")}
          </span>
        </div>
        <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
      </button>

      {/* 占位项(对齐上游 disabled placeholder),后续可点 */}
      <DisabledMenuItem
        icon={<ToggleLeft size={18} className="shrink-0 text-text-tertiary" />}
        title={tt("base.botManage.menu.autoApprove")}
        comingSoon={tt("base.botManage.menu.comingSoon")}
      />
    </div>
  );
}

function DisabledMenuItem({
  icon,
  title,
  comingSoon,
}: {
  icon: React.ReactNode;
  title: string;
  comingSoon: string;
}) {
  return (
    <div className="flex cursor-default items-center gap-3 rounded-md border border-border-subtle bg-bg-elevated px-4 py-3 opacity-60">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <span className="text-[12px] text-text-tertiary">{comingSoon}</span>
      </div>
    </div>
  );
}

export function MentionFreeListPage({ robotId }: { robotId: string }) {
  const tt = useT();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [debouncedKw, setDebouncedKw] = useState("");
  useDebounceKeyword(keyword, setDebouncedKw);

  const queryKey = useMemo(
    () => ["bot-manage", "groups", robotId, debouncedKw] as const,
    [robotId, debouncedKw],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey,
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        listRobotGroups({
          robotId,
          limit: 30,
          cursor: pageParam,
          q: debouncedKw || undefined,
        }),
      getNextPageParam: (last: RobotGroupListResp) => (last.has_more ? last.next_cursor : null),
      staleTime: 5 * 1000,
    });

  const groups = useMemo<RobotGroupItem[]>(() => {
    const all = data?.pages.flatMap((p) => p.list) ?? [];
    const enabled = all.filter((g) => g.no_mention);
    const others = all.filter((g) => !g.no_mention);
    return [...enabled, ...others];
  }, [data]);

  const toggleMu = useMutation({
    mutationFn: async (args: { groupNo: string; next: boolean }) => {
      if (args.next) {
        await setRobotMentionPref(robotId, args.groupNo, true);
      } else {
        await deleteRobotMentionPref(robotId, args.groupNo);
      }
      return args;
    },
    onSuccess: (args) => {
      qc.setQueryData<{ pages: RobotGroupListResp[]; pageParams: (string | null)[] } | undefined>(
        queryKey,
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((p) => ({
              ...p,
              list: p.list.map((g) =>
                g.group_no === args.groupNo ? { ...g, no_mention: args.next } : g,
              ),
            })),
          };
        },
      );
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("base.botManage.mentionFree.toggleFailed"),
      );
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
          <Search size={14} className="shrink-0 text-text-tertiary" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tt("base.botManage.mentionFree.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-3">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">
            {tt("base.common.loading")}
          </div>
        ) : isError ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">
            {tt("base.botManage.mentionFree.loadFailed")}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">
            {debouncedKw
              ? tt("base.botManage.mentionFree.noMatches")
              : tt("base.botManage.mentionFree.noGroups")}
          </div>
        ) : (
          <SectionGroup>
            {groups.map((g) => (
              <MentionFreeRow
                key={g.group_no}
                group={g}
                pending={
                  toggleMu.isPending &&
                  (toggleMu.variables as { groupNo: string } | undefined)?.groupNo === g.group_no
                }
                onToggle={(next) => toggleMu.mutate({ groupNo: g.group_no, next })}
              />
            ))}
          </SectionGroup>
        )}

        {hasNextPage ? (
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className="rounded-md px-3 py-1 text-[12px] text-text-tertiary hover:bg-bg-hover disabled:opacity-50"
            >
              {isFetchingNextPage
                ? tt("base.common.loading")
                : tt("base.botManage.mentionFree.loadMore")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MentionFreeRow({
  group,
  pending,
  onToggle,
}: {
  group: RobotGroupItem;
  pending: boolean;
  onToggle: (next: boolean) => void;
}) {
  const tt = useT();
  // group_allow_no_mention=false 时:群管理员关了总开关,bot 主人即使开也无效
  // → toggle 禁用 + 副标题提示(对齐上游 disabled state)
  const blocked = !group.group_allow_no_mention;
  const subtitle = blocked
    ? tt("base.botManage.mentionFree.rowBlocked")
    : group.no_mention
      ? tt("base.botManage.mentionFree.rowOn")
      : tt("base.botManage.mentionFree.rowOff");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-text-primary">{group.name || group.group_no}</span>
        <span className="text-[11px] text-text-tertiary">{subtitle}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={group.no_mention}
        disabled={blocked || pending}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(!group.no_mention);
        }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          group.no_mention ? "bg-success" : "bg-bg-elevated"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            group.no_mention ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** keyword → 300ms 后写入 debounced(避免每键都打后端 search)。 */
function useDebounceKeyword(input: string, setDebounced: (v: string) => void): void {
  useEffect(() => {
    const id = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input, setDebounced]);
}
