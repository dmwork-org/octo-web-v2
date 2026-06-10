import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search } from "lucide-react";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { getChatCandidates } from "@/features/summary/api/summary.api";
import { MAX_CHAT_SELECT } from "@/features/summary/constants/topic-templates";
import type { ChatCandidate } from "@/features/summary/types/summary.types";

type Tab = "all" | "group" | "direct";

const TAB_KEY: Record<Tab, string> = {
  all: "summary.chatSelector.all",
  group: "summary.chatSelector.tabGroup",
  direct: "summary.chatSelector.tabDirect",
};

interface ChatSelectorModalProps {
  open: boolean;
  selected: ChatCandidate[];
  /** 默认 MAX_CHAT_SELECT(30),老仓同。 */
  maxSelect?: number;
  onConfirm: (selected: ChatCandidate[]) => void;
  onCancel: () => void;
}

interface DisplayEntry {
  item: ChatCandidate;
  indent: boolean;
}

/**
 * 把 candidates 按 (tab, keyword) 过滤 + group → thread 层次展示。
 * - "all":group + 缩进 thread + direct;有关键词时全 flatten 按 name 过滤
 * - "group":只 group + 缩进 thread + 孤儿 thread
 * - "direct":只 direct
 */
function buildDisplayList(
  candidates: ChatCandidate[],
  tab: Tab,
  keyword: string,
): DisplayEntry[] {
  const kw = keyword.trim().toLowerCase();

  if (tab === "direct") {
    return candidates
      .filter((c) => c.chat_type === "direct")
      .filter((c) => !kw || c.name.toLowerCase().includes(kw))
      .map((c) => ({ item: c, indent: false }));
  }

  const groups = candidates.filter((c) => c.chat_type === "group");
  const threads = candidates.filter((c) => c.chat_type === "thread");
  const directs = tab === "all" ? candidates.filter((c) => c.chat_type === "direct") : [];

  const groupIds = new Set(groups.map((g) => g.chat_id));
  const threadsByParent = new Map<string, ChatCandidate[]>();
  const orphanThreads: ChatCandidate[] = [];
  for (const th of threads) {
    if (th.parent_group_no && groupIds.has(th.parent_group_no)) {
      const arr = threadsByParent.get(th.parent_group_no) ?? [];
      arr.push(th);
      threadsByParent.set(th.parent_group_no, arr);
    } else {
      orphanThreads.push(th);
    }
  }

  // 有 keyword 时 flatten 全展开过滤;无 keyword 时按层次展示
  if (kw) {
    const out: DisplayEntry[] = [];
    for (const g of groups) {
      if (g.name.toLowerCase().includes(kw)) out.push({ item: g, indent: false });
      for (const th of threadsByParent.get(g.chat_id) ?? []) {
        if (th.name.toLowerCase().includes(kw)) out.push({ item: th, indent: true });
      }
    }
    for (const th of orphanThreads) {
      if (th.name.toLowerCase().includes(kw)) out.push({ item: th, indent: false });
    }
    for (const d of directs) {
      if (d.name.toLowerCase().includes(kw)) out.push({ item: d, indent: false });
    }
    return out;
  }

  const out: DisplayEntry[] = [];
  for (const g of groups) {
    out.push({ item: g, indent: false });
    for (const th of threadsByParent.get(g.chat_id) ?? []) {
      out.push({ item: th, indent: true });
    }
  }
  for (const th of orphanThreads) out.push({ item: th, indent: false });
  for (const d of directs) out.push({ item: d, indent: false });
  return out;
}

/**
 * 选择聊天作为总结来源(chat-summary-new-modal 内的二级 modal)。
 *
 * - 后端 `/summary-chat-candidates` 返回当前 space 内所有授权 chat(全量,
 *   跟最近会话列表不同),按 group → thread → direct 层次展示。
 * - "全部 / 群聊 / 私聊" 三 tab 切换 + 名字模糊搜索。
 * - 多选,达到 maxSelect 后再点不增加(对齐老仓静默策略,不弹 toast)。
 * - 嵌套在 chat-summary-new-modal 内,BaseDialog 自动给 z-dialog-secondary。
 */
export function ChatSelectorModal({
  open,
  selected,
  maxSelect = MAX_CHAT_SELECT,
  onConfirm,
  onCancel,
}: ChatSelectorModalProps) {
  const tr = useT();
  const [tab, setTab] = useState<Tab>("all");
  const [keyword, setKeyword] = useState("");
  const [localSelected, setLocalSelected] = useState<ChatCandidate[]>(selected);

  // 打开时重置本地选中态(用 prop 快照)
  useResetOnOpen(open, () => {
    setLocalSelected([...selected]);
    setKeyword("");
    setTab("all");
  });

  const { data: candidates, isLoading } = useQuery({
    queryKey: ["summary", "chat-candidates"],
    queryFn: () => getChatCandidates({}),
    enabled: open,
    staleTime: 30 * 1000,
  });

  const displayList = useMemo(
    () => buildDisplayList(candidates ?? [], tab, keyword),
    [candidates, tab, keyword],
  );

  const selectedIds = useMemo(
    () => new Set(localSelected.map((s) => s.chat_id)),
    [localSelected],
  );

  const toggle = (item: ChatCandidate) => {
    if (selectedIds.has(item.chat_id)) {
      setLocalSelected((prev) => prev.filter((c) => c.chat_id !== item.chat_id));
    } else if (localSelected.length < maxSelect) {
      setLocalSelected((prev) => [...prev, item]);
    }
  };

  const footer = (
    <div className="flex w-full items-center justify-between">
      <span className="text-xs text-text-tertiary">
        {tr("summary.chatSelector.selectedCount", {
          values: { count: localSelected.length, max: maxSelect },
        })}
      </span>
      <div className="flex gap-2">
        <Button type="tertiary" theme="borderless" onClick={onCancel}>
          {tr("summary.common.cancel")}
        </Button>
        <Button type="primary" theme="solid" onClick={() => onConfirm(localSelected)}>
          {tr("summary.common.confirm")}
        </Button>
      </div>
    </div>
  );

  return (
    <BaseDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
      size="md"
      height="md"
      title={tr("summary.chatSelector.title")}
      footer={footer}
    >
      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-border-default bg-bg-base px-3 py-2">
          <Search size={14} className="shrink-0 text-text-tertiary" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tr("summary.chatSelector.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>

        <div className="flex shrink-0 gap-1 rounded-md bg-bg-elevated p-1">
          {(Object.keys(TAB_KEY) as Tab[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex-1 rounded-sm px-3 py-1 text-xs transition-colors ${
                tab === k
                  ? "bg-bg-surface font-semibold text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tr(TAB_KEY[k])}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
              {tr("summary.common.loading")}
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-xs text-text-tertiary">
              {tr("summary.chatSelector.noData")}
            </div>
          ) : (
            displayList.map(({ item, indent }) => {
              const checked = selectedIds.has(item.chat_id);
              return (
                <button
                  key={`${item.chat_type}-${item.chat_id}`}
                  type="button"
                  onClick={() => toggle(item)}
                  className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-bg-hover ${
                    checked ? "bg-brand-tint" : ""
                  } ${indent ? "pl-7" : ""}`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                      checked ? "border-brand bg-brand text-white" : "border-border-default"
                    }`}
                  >
                    {checked ? <Check size={12} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-text-primary">{item.name}</span>
                  {item.member_count != null ? (
                    <span className="shrink-0 text-[10px] text-text-tertiary">
                      {item.member_count}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </BaseDialog>
  );
}

function useResetOnOpen(open: boolean, reset: () => void): void {
  useEffect(() => {
    if (open) reset();
    // 仅在 open 0→1 transition 时重置;reset 不进 deps 避免每渲染都跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
