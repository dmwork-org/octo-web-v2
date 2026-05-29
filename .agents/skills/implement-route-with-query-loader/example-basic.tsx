// Basic列表页骨架 — TanStack Router file-based route + TanStack Query loader 集成
// 来源:基于 TanStack Router 官方 external-data-loading 指南 canonical pattern
// 见 ./references/REFERENCE.md

import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ofetch } from "ofetch";

// ─── 1. Query options factory(实际项目放 src/features/posts/queries.ts)────
interface Post {
  id: string;
  title: string;
  body: string;
}

const postQueries = {
  all: () =>
    queryOptions({
      queryKey: ["posts"] as const,
      queryFn: () => ofetch<Post[]>("/api/posts"),
    }),
};

// ─── 2. Route with loader ─────────────────────────────────────────────────
export const Route = createFileRoute("/posts/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(postQueries.all()),
  component: PostsPage,
});

// ─── 3. Component with useSuspenseQuery ───────────────────────────────────
function PostsPage() {
  const { data: posts } = useSuspenseQuery(postQueries.all());

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
