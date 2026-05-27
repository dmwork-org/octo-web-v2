# P3-matter API 映射

> 旧 `dmworktodo/src/api/todoApi.ts` 的 endpoint 1:1 迁到新 `features/matter/api/matter.api.ts`。
> endpoint 位置在 feature-local(非 base),理由见 [decisions.md](./decisions.md) D-2。

## 后端 baseURL

后端服务 prefix:`/matter/api/v1`(注意:**与 IM 主接口 `/v1/` 不同**,事项服务独立部署)。

旧项目用独立 axios 实例(`matterAxios`)避免 baseURL 双前缀;新项目我们直接拼绝对路径或者建独立 ofetch 实例。**推荐**:在 `features/base/api/client.ts` 旁建 `matter-client.ts`,baseURL 写死 `/matter/api/v1`,共用同一套 5 个拦截器(auth / spaceHeader / errorToast / refreshToken / reqIdTracing)。

## Endpoint 清单(本期需要的)

| 旧函数                             | HTTP   | Path                             | 新位置                              | 备注                                            |
| ---------------------------------- | ------ | -------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `listMatters(params)`              | GET    | `/matters`                       | `features/matter/api/matter.api.ts` | 游标分页,query params 见下                      |
| `getMatter(id)`                    | GET    | `/matters/:id`                   | 同上                                | 返回 MatterDetail(assignees + channels)         |
| `createMatter(req)`                | POST   | `/matters`                       | 同上                                | body:CreateMatterReq                            |
| `updateMatter(id, req)`            | PUT    | `/matters/:id`                   | 同上                                | title / description / DDL / remind_at           |
| `transitionMatter(id, status)`     | PUT    | `/matters/:id/status`            | 同上                                | body:`{status: "open" \| "done" \| "archived"}` |
| `deleteMatter(id)`                 | DELETE | `/matters/:id`                   | 同上                                |                                                 |
| `addAssignee(matterId, userId)`    | POST   | `/matters/:id/assignees`         | 同上                                | body:`{user_id}`                                |
| `removeAssignee(matterId, userId)` | DELETE | `/matters/:id/assignees/:userId` | 同上                                |                                                 |

## Endpoint 清单(本期**不**做,留 P3+)

跳过下面这些,**不要**为了凑数把代码先撸出来 — 等下一期带 UI 一起做:

- `linkChannel` / `unlinkChannel` — `/matters/:id/channels` POST/DELETE
- `extractMatter` — `/matters/extract` POST(从 IM 消息抽取)
- `listTimeline` / `addTimelineEntry` / `deleteTimelineEntry` — `/matters/:id/timeline` GET/POST/DELETE
- `listComments` / `addComment` / `deleteComment` — timeline 的 wrapper
- `listActivities` — `/matters/:id/activities` GET

## 关键类型

直接抄旧 `bridge/types.ts` 到新 `features/matter/types.ts`,**精简版** — 只留本期需要的:

```ts
export type MatterStatus = "open" | "done" | "archived";

export interface Matter {
  id: string;
  seq_no: number;
  space_id: string;
  title: string;
  description?: string;
  creator_id: string;
  status: MatterStatus;
  deadline?: string;
  remind_at?: string;
  source_channel_id?: string;
  source_channel_type?: number;
  source_name?: string;
  assignees?: MatterAssignee[];
  created_at: string;
  updated_at: string;
}

export interface MatterDetail extends Matter {
  assignees: MatterAssignee[];
  participants?: string[];
  // channels 字段本期不展示,省略类型也行
}

export interface MatterAssignee {
  id: string;
  matter_id: string;
  user_id: string;
  created_at: string;
}

export interface MatterListParams {
  status?: MatterStatus;
  assignee_id?: string;
  creator_id?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface CreateMatterReq {
  title: string;
  description?: string;
  assignee_ids?: string[];
  deadline?: string;
  remind_at?: string;
}

export interface UpdateMatterReq {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
}

export interface Pagination {
  has_more: boolean;
  next_cursor?: string;
}

export interface PaginatedList<T> {
  data: T[];
  pagination: Pagination;
}
```

## 3 个 tab 对应的 query 参数

| Tab               | params                 |
| ----------------- | ---------------------- |
| 我负责的(mine)    | `{assignee_id: myUid}` |
| 我创建的(created) | `{creator_id: myUid}`  |
| 全部(all)         | `{}`                   |

后端会按可见性自动收敛(只返回当前用户能看到的)。

## 状态切换的细节

`transitionMatter` 接 `/matters/:id/status`,body `{status}`,响应是更新后的完整 MatterDetail。前端 mutation onSuccess:

- `qc.setQueryData` 更新单条 detail cache 立即生效
- `qc.invalidateQueries` 让列表自动重拉(避免乐观更新跟服务器对不上)

## 分页处理

后端返回 `{data: Matter[], pagination: {has_more, next_cursor}}`。

用 `useInfiniteQuery`:

- `getNextPageParam: (last) => last.pagination.has_more ? last.pagination.next_cursor : undefined`
- 渲染 `data?.pages.flatMap(p => p.data)`
- 底部触底加载(参考 `features/chat/components/message-list.tsx` 的 `usePulldownToLoadHistory`,方向相反)

## 错误处理

`features/base/api/client.ts` 的 `errorToast` 拦截器已经在 4xx/5xx 时 toast 报错,业务层 mutation onError 只需补"操作失败"语义化兜底。
