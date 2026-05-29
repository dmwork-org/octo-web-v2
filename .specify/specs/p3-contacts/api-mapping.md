# P3-contacts API 映射(最终)

> 经 D-6 决策后大量 API / sub-page 砍除,本文档反映最终现状。完整决策见 [`decisions.md`](./decisions.md)。

## 后端 baseURL

contacts 走 **IM 主接口 `/v1/`**,**复用** `features/base/api/client.ts` 的 ofetch 实例 + 5 拦截器。

**与 matter 区别**:matter 因 `/matter/api/v1` 独立部署、走独立后端服务,建了 `features/matter/api/matter-client.ts`;contacts 全部 endpoint 在 IM 主接口下,**不**建独立 client。

## 最终 endpoint 清单(contacts/api/friends.api.ts,4 函数)

| Endpoint            | HTTP   | 函数            | 谁消费                                                                                 |
| ------------------- | ------ | --------------- | -------------------------------------------------------------------------------------- |
| `/v1/friend/search` | GET    | `searchFriends` | `chat/components/friend-add-form` 加好友主入口                                         |
| `/v1/friend/apply`  | POST   | `applyFriend`   | `chat/components/friend-add-form` + `base/components/modals/{friend-apply,bot-detail}` |
| `/v1/friend/remark` | PUT    | `setUserRemark` | `base/components/modals/user-info-modal`                                               |
| `/v1/friends/:uid`  | DELETE | `deleteFriend`  | `base/components/modals/user-info-modal`                                               |

**已砍**(D-6 决策):

- `syncFriends`(`POST /v1/friend/sync`)— 原 friend-list / blacklist 用,sub-page 砍后无消费者
- `getFriendApplies` / `acceptFriendApply` / `deleteFriendApply` / `clearFriendApplyReddot`(原 `friend-applies.api.ts`)— sub-page 砍后整文件删

## 复用 base/endpoints/

| base 文件      | 函数                                          | 谁用                                                   |
| -------------- | --------------------------------------------- | ------------------------------------------------------ |
| `space.api.ts` | `getSpaceMembers(spaceId)`                    | `queries/directory.query.ts`(directory 全部联系人段)   |
| `robot.api.ts` | `getMyBots(spaceId)`, `getSpaceBots(spaceId)` | `queries/directory.query.ts`(directory AI 段 + filter) |
| `group.api.ts` | `getMyGroups(spaceId)`                        | `queries/directory.query.ts`(directory 群段)           |

**模板原则**(D-2):endpoint 落地按"独立业务域 vs IM 共享"切分,contacts 现状已切分对。

## 跨 feature API 出口归属(D-6)

`contacts/api/friends.api.ts` 的 4 个函数加 `friend.types.ts` 的 `Friend` 类型,是 contacts 域**对外 API**。本期 contacts 内部无 UI 直接调用(主目录走 directory.query 的 4 个 base endpoint)。

D-6 原则:**API 留 contacts 域(数据契约归属),UI 由消费者拥有**。这跟 D-2 一致 — D-2 讲"独立业务域 vs IM 共享",D-6 进一步细化"UI vs API 归属可分家"。

## 类型

`features/contacts/types/friend.types.ts`(41 行,完整 Friend interface 含 vercode/follow/short_no 等字段),服务跨 feature 消费者。

## 错误处理

沿用 `features/base/api/client.ts` 的 `errorToast` 拦截器(4xx/5xx 自动 toast),业务层 mutation `onError` 只需补"操作失败"语义化兜底(见 `chat/components/friend-add-form.tsx`)。
