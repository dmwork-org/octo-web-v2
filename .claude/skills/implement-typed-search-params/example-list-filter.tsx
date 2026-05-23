// Typed search params 完整骨架 — matter 列表 + 过滤 + 分页 + 搜索
// 来源:TanStack Router validateSearch 官方指南 + zod schema 标准
// 见 ./references/REFERENCE.md

import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";

// ─── 1. zod schema(放在 route 文件顶部或 features/<feat>/types.ts)──────────

const matterSearchSchema = z.object({
  status: z.enum(["all", "open", "doing", "done"]).default("all"),
  sort: z.enum(["due_asc", "due_desc", "created_desc"]).default("created_desc"),
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().optional(),
});

type MatterSearch = z.infer<typeof matterSearchSchema>;

// ─── 2. queryOptions 工厂(实际放 features/matter/queries/matters.query.ts)──

const matterQueries = {
  list: (params: MatterSearch) =>
    queryOptions({
      queryKey: ["matters", params] as const,
      queryFn: () => fetchMatters(params),
    }),
};

declare function fetchMatters(params: MatterSearch): Promise<{
  items: { id: string; title: string }[];
  total: number;
}>;

// ─── 3. file route 用 validateSearch ──────────────────────────────────────

export const Route = createFileRoute("/_auth/matter")({
  validateSearch: matterSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.ensureQueryData(matterQueries.list(deps)),
  component: MatterView,
});

// ─── 4. 组件消费 + 改 search ───────────────────────────────────────────────

function MatterView() {
  const { status, sort, page, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const matters = useSuspenseQuery(matterQueries.list({ status, sort, page, q }));

  return (
    <div>
      {/* 过滤 — 用 reducer 形式保留其他参数,改 status 顺手把 page 归零 */}
      <div className="flex gap-2">
        {(["all", "open", "doing", "done"] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-active={s === status}
            onClick={() => void navigate({ search: (prev) => ({ ...prev, status: s, page: 1 }) })}
          >
            {s}
          </button>
        ))}
      </div>

      {/* 搜索 — 防抖在更上层 hook(useDebounce)做,这里假定已 debounced */}
      <input
        value={q ?? ""}
        onChange={(e) => {
          const next = e.target.value;
          void navigate({
            search: (prev) => ({ ...prev, q: next || undefined, page: 1 }),
          });
        }}
        placeholder="搜事项"
      />

      {/* 列表 */}
      <ul>
        {matters.data.items.map((m) => (
          <li key={m.id}>
            <Link to="/_auth/matter" search={(prev) => ({ ...prev, detail: m.id })}>
              {m.title}
            </Link>
          </li>
        ))}
      </ul>

      {/* 分页 */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page - 1 }) })}
        >
          上一页
        </button>
        <span>第 {page} 页</span>
        <button
          type="button"
          onClick={() => void navigate({ search: (prev) => ({ ...prev, page: prev.page + 1 }) })}
        >
          下一页
        </button>
      </div>
    </div>
  );
}
