// Mutation 最小骨架 — create / update / 乐观 toggle 三件套
// 来源:TanStack Query 官方 mutations + optimistic updates 文档 canonical pattern
// 见 ./references/REFERENCE.md

import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

// ─── 0. domain types & endpoints(实际项目分文件)──────────────────────────
interface Matter {
  id: string;
  title: string;
  ownerId: string;
  done: boolean;
}

const todoEndpoints = {
  list: () => ofetch<Matter[]>("/api/matters"),
  create: (body: Pick<Matter, "title" | "ownerId">) =>
    ofetch<Matter>("/api/matters", { method: "POST", body }),
  update: (id: string, body: Partial<Matter>) =>
    ofetch<Matter>(`/api/matters/${id}`, { method: "PATCH", body }),
};

// ─── 1. queryOptions factory(实际项目放 src/features/todo/queries.ts)─────
const matterQueries = {
  all: () =>
    queryOptions({
      queryKey: ["matters"] as const,
      queryFn: () => todoEndpoints.list(),
    }),
  byId: (id: string) =>
    queryOptions({
      queryKey: ["matters", id] as const,
      queryFn: () => ofetch<Matter>(`/api/matters/${id}`),
    }),
};

// ─── 2. create mutation(invalidate 列表)──────────────────────────────────
export const useCreateMatter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Pick<Matter, "title" | "ownerId">) => todoEndpoints.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.all().queryKey,
      });
    },
  });
};

// ─── 3. update mutation(invalidate 列表 + 单条)────────────────────────────
export const useUpdateMatter = (id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Matter>) => todoEndpoints.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.all().queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: matterQueries.byId(id).queryKey,
      });
    },
  });
};

// ─── 4. 乐观 toggle(setQueryData + 失败回滚)─────────────────────────────
export const useToggleMatterDone = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => todoEndpoints.update(id, { done }),
    onMutate: async ({ id, done }) => {
      const key = matterQueries.byId(id).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<Matter>(key);
      queryClient.setQueryData<Matter>(key, (old) => (old ? { ...old, done } : old));
      return { prev, key };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_data, _err, { id }) => {
      void queryClient.invalidateQueries({
        queryKey: matterQueries.byId(id).queryKey,
      });
    },
  });
};

// ─── 5. 组件调用站点 ──────────────────────────────────────────────────────
export function MatterList() {
  const { data } = useSuspenseQuery(matterQueries.all());
  const create = useCreateMatter();
  const toggle = useToggleMatterDone();
  return (
    <div>
      <button
        disabled={create.isPending}
        onClick={() => create.mutate({ title: "new matter", ownerId: "me" })}
      >
        {create.isPending ? "saving..." : "add"}
      </button>
      <ul>
        {data.map((m) => (
          <li key={m.id}>
            <input
              type="checkbox"
              checked={m.done}
              onChange={(e) => toggle.mutate({ id: m.id, done: e.target.checked })}
            />
            {m.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
