# P3-contacts API 映射

> contacts 起步即基本现代化(0 `any` / 0 裸 `fetch` / `features/base/api/client.ts` 已用对),endpoints 已按 [P3-matter D-2](../p3-matter/decisions.md#d-2-endpoints-位置反转-task-list保留-featuresmatterapi) 原则正确分布。本文档主要是**校验清单 + 复用清单 + 缺口清单**,不重新映射。

## 后端 baseURL

contacts 走 **IM 主接口 `/v1/`**,**复用** `features/base/api/client.ts` 的 ofetch 实例 + 5 拦截器(auth / spaceHeader / errorToast / refreshToken / reqIdTracing)。

**跟 matter 显著区别**:matter 因 `/matter/api/v1` 独立部署、走独立后端服务,所以建了 `features/matter/api/matter-client.ts`;contacts 全部 endpoint 在 IM 主接口下,**不**建独立 client。

## 现有 endpoint(已落地,本期 commit 0 校验)

`features/contacts/api/` 当前 122 行,8 个 endpoint:

| Endpoint                      | HTTP   | 当前位置                                      | 用途                                              |
| ----------------------------- | ------ | --------------------------------------------- | ------------------------------------------------- |
| `/v1/friend/sync`             | GET    | `features/contacts/api/friends.api.ts`        | 全量 / 增量同步好友列表(`limit` + `version` 增量) |
| `/v1/friend/search`           | GET    | 同上                                          | 搜索好友(给加好友页用,`keyword` 模糊匹配)         |
| `/v1/friend/apply`            | POST   | 同上                                          | 发起好友申请(`to_uid` + `remark` + `vercode`)     |
| `/v1/friend/remark`           | PUT    | 同上                                          | 设置好友备注                                      |
| `/v1/friends/:uid`            | DELETE | 同上                                          | 删除好友                                          |
| `/v1/friend/apply`            | GET    | `features/contacts/api/friend-applies.api.ts` | 查询好友申请列表(`page_index` + `page_size`)      |
| `/v1/friend/sure`             | POST   | 同上                                          | 接受申请(`token` + 可选 `space_id`)               |
| `/v1/friend/apply/:toUid`     | DELETE | 同上                                          | 删除/拒绝申请                                     |
| `/v1/user/reddot/friendApply` | DELETE | 同上                                          | 清空新朋友红点                                    |

**校验任务**(commit 0 audit):

- ✅ 9 endpoint(原 spec 写 8 条少算 `friend/remark`)全部已落,path / method / body shape 与旧 dmworkcontacts 调用一致
- ✅ `friend/sync` 实际是 GET(原 spec 误标 POST,本 commit 顺手改)
- ✅ `Friend.vercode` 字段透传到 `applyFriend`,前端无需预校验
- 详见 [`audit.md`](./audit.md) endpoint path 校对小节

**模板原则**(D-2):endpoint 落地按"独立业务域 vs IM 共享"切分。contacts 自营 friend / friend-apply / reddot 在 `features/contacts/api/`(独占);IM 共享的 space / robot / group / blacklist / user 复用 `features/base/api/endpoints/`(已落地)。本期不需调整位置。

## 复用 base/endpoints/(无需新增,只调用)

| base 文件          | endpoint                                                        | 谁用                                       | 备注                                   |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------ | -------------------------------------- |
| `space.api.ts`     | `GET /v1/spaces/:id/members`                                    | `contacts-directory` 全部联系人段          | 已有 `queries/directory.query.ts` 包装 |
| `robot.api.ts`     | `GET /v1/robots/my`, `GET /v1/spaces/:id/bots`                  | `contacts-directory` AI 段                 | 同上                                   |
| `group.api.ts`     | `GET /v1/group/my`                                              | `saved-groups` + `contacts-directory` 群段 | 旧 `GroupSave/vm.tsx` 调用路径已对齐   |
| `blacklist.api.ts` | `GET /v1/user/blacklist`, `POST/DELETE /v1/user/blacklist/:uid` | `blacklist`                                | 已落地                                 |
| `user.api.ts`      | `GET /v1/users/:uid`                                            | 头像 / 用户名兜底                          | 通用                                   |
| `channel.api.ts`   | `GET /v1/channels/:no`                                          | 头像(`ChannelAvatar` 内部)                 | 间接依赖,本期不直接调                  |

**判断标准**(沿用 D-2):

- 跨 feature 共享 + IM 域共消费 → `features/base/api/endpoints/*.api.ts`(本表内 5 个文件均符合)
- 单 feature 独占业务域 → `features/<feature>/api/*.api.ts`(contacts 的 friend / friend-apply / reddot)

## 缺口 endpoint(本期可能需补,commit 0 audit 输出后回填)

audit 报告产出后此节具体化。预期项:

- **拼音分组工具**:不是 endpoint,但归在"基建缺口"。`features/base/lib/pinyin-bucket`(Explore 报告标"待接进来"):若已存在直接接,若不存在本期在 `features/contacts/lib/pinyin-bucket.ts` 抽出来 — 等 summary feature 用到再上升 base
- **friend-add vercode 校验**:Explore 标"未验证"。commit 0 audit 时确认:后端是否要前端先校验 vercode 长度 / 格式;需要则 commit 5 补,不需要则 audit.md 标 ✅ 关闭

## 不做(P3+)

- ❌ **企业组织相关 endpoint**(`/v1/spaces/:id/orgs` 系列)— 等 Organizational 需求确认
- ❌ **联系人详情编辑相关 endpoint**(改群信息 / 群成员管理等)— 强耦合 chat 写路径,留 P4+ "通讯录详情面板"一并做
- ❌ **批量操作 / 导出 / 标签** — 旧项目无,新需求未提

## 关键类型

不重抄 — `features/contacts/types/{friend,friend-apply}.types.ts` 已有 59 行覆盖:

```ts
// friend.types.ts(已存在,行数 37)
export interface Friend {
  uid: string;
  name: string;
  remark?: string;
  status: number; // 0=正常 1=黑名单 ...
  robot: boolean;
  // ... 其他字段
}

// friend-apply.types.ts(已存在,行数 22)
export interface FriendApply {
  id: string;
  applicant_uid: string;
  status: number;
  // ... 其他字段
}
```

本期若 audit 发现新增字段(例如 vercode 类型 / 红点结构),在对应文件 **追加**,**不**开新文件。

## 分页 / 错误处理

contacts 列表数据量本期都不算大(好友 / 群 / AI 通常几十~几百量级),**不**需要 `useInfiniteQuery`,普通 `useQuery` + `queryOptions` 够用。

错误处理沿用 `features/base/api/client.ts` 的 `errorToast` 拦截器(4xx/5xx 自动 toast),业务 mutation onError 只需补"操作失败"语义化兜底。
