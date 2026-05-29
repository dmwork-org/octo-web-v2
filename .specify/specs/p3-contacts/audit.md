# contacts feature audit — commit 0

> 实施 P3-contacts 前先对位旧 dmworkcontacts 8 模块,标已实现 / 部分 / 未做,**校正 spec 想象 vs 真实代码的差距**,定真实 commit 计划。
> 不动代码,只产本文档。

## 基线指标(commit 0 落笔时)

| 指标                              | 值              | 备注                                                                                                               |
| --------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`                      | ⚠️ 失败         | 但失败原因仅 markdown 格式(spec 三件套 + handoff.md + settings.local.json),源代码端绿;commit 8 跑 `vp check --fix` |
| `pnpm structure-lint`             | 🟢 0 violations | 目录 / 文件名 / 后缀全合规                                                                                         |
| contacts 总行数                   | 1491            | spec 里写的 1486 微差,无所谓                                                                                       |
| contacts → chat 跨 feature import | 10 处           | structure-lint **不管**(只查目录结构,不查 import),纯文档化即可                                                     |

## 模块对位

| 旧模块               | 新组件                                | 行数 | 状态    | 行动                                                           |
| -------------------- | ------------------------------------- | ---- | ------- | -------------------------------------------------------------- |
| `Contacts/index.tsx` | `components/contacts-directory.tsx`   | 495  | ✅ 实现 | 已用 `bucketLetter` from base/lib;无 # 边界硬编码,spec 误判    |
| `FriendAdd/`         | `components/friend-add.tsx`           | 130  | ✅ 实现 | vercode 已在 `friends.api.ts` 处理,spec 误判                   |
| `NewFriend/`         | `components/friend-applies.tsx`       | 130  | ✅ 实现 | 红点 endpoint `DELETE /v1/user/reddot/friendApply` 已落        |
| `Blacklist/`         | `components/blacklist.tsx`            | 66   | ✅ 实现 | —                                                              |
| `GroupSave/`         | `components/saved-groups.tsx`         | 84   | ✅ 实现 | —                                                              |
| `Organizational/`    | (无)                                  | —    | ❌ 未做 | **P3+ 留**(spec 已划界)                                        |
| `Service/`           | TanStack Query invalidate 替代        | —    | ✅ 等价 | —                                                              |
| `api/` 调用聚合      | `api/{friends,friend-applies}.api.ts` | 122  | ✅ 实现 | 8 endpoint 全落,path / method 与 `Friend.vercode` 类型暗示对齐 |
| FriendList           | `components/friend-list.tsx`          | 153  | ⚠️ 部分 | **自定义 `bucketLetter`(line 14),没用 base/lib** — commit 2 修 |
| AI 推荐入口          | `components/botfather-banner.tsx`     | 33   | ✅ 实现 | —                                                              |

## endpoint path 校对(逐条)

| Endpoint                             | 新 api 文件                | path 一致                            | response shape  | 备注                                           |
| ------------------------------------ | -------------------------- | ------------------------------------ | --------------- | ---------------------------------------------- |
| `POST /v1/friend/sync` (GET 实际)    | `friends.api.ts:17`        | ✅ method 实际是 GET(注释里也写 GET) | `Friend[]`      | spec 误标为 POST,真实是 GET — api-mapping 待修 |
| `GET /v1/friend/search`              | `friends.api.ts:32`        | ✅                                   | `Friend[]`      | trim 空串短路                                  |
| `POST /v1/friend/apply`              | `friends.api.ts:47`        | ✅                                   | void            | vercode 透传 Friend.vercode                    |
| `PUT /v1/friend/remark`              | `friends.api.ts:66`        | ✅                                   | void            | —                                              |
| `DELETE /v1/friends/:uid`            | `friends.api.ts:77`        | ✅                                   | void            | uri encode                                     |
| `GET /v1/friend/apply`               | `friend-applies.api.ts:19` | ✅                                   | `FriendApply[]` | 分页 page_index/size,默认 999 一次拉全         |
| `POST /v1/friend/sure`               | `friend-applies.api.ts:30` | ✅                                   | void            | body 含可选 space_id                           |
| `DELETE /v1/friend/apply/:toUid`     | `friend-applies.api.ts:37` | ✅                                   | void            | —                                              |
| `DELETE /v1/user/reddot/friendApply` | `friend-applies.api.ts:41` | ✅                                   | void            | 清红点                                         |

**结论**:9 endpoint 全部落齐(api-mapping spec 列 8 条少算 `friend/remark` 1 条 — 已补)。

## 复用 base/endpoints 用法

| base 文件          | endpoint                                      | 实际使用点                         | 状态    |
| ------------------ | --------------------------------------------- | ---------------------------------- | ------- |
| `space.api.ts`     | `getSpaceMembers(spaceId)`                    | `queries/directory.query.ts:24`    | ✅      |
| `robot.api.ts`     | `getMyBots(spaceId)`, `getSpaceBots(spaceId)` | `queries/directory.query.ts:33,42` | ✅      |
| `group.api.ts`     | `getMyGroups(spaceId)`                        | `queries/directory.query.ts:52`    | ✅      |
| `blacklist.api.ts` | —                                             | `blacklist.tsx` 内部消费           | ✅ 已落 |
| `user.api.ts`      | —                                             | 头像 / 用户名兜底                  | ✅      |

## 违规项确认(spec 想象 vs 真实)

### ✅ 真实违规(commit 必做)

1. **`views/contacts.view.tsx:41` `useState<SubPage>`** 存 sub-page state — 违 CLAUDE.md "useState 不存 URL 状态"
2. **`src/routes/_auth.contacts.tsx` 缺 loader** — 仅 7 行,无 ensureQueryData 预热
3. **`friend-list.tsx:14` 自定义 `bucketLetter`** — 没用 `base/lib/pinyin-bucket`(contacts-directory 已用对)

### ❌ spec 想象但实际已修齐(commit 取消)

1. **拼音 `#` 边界硬编码** — `contacts-directory.tsx` 直接 import 用 `base/lib/pinyin-bucket`,**已规范**;只有 `friend-list.tsx` 自定义版要换(降级合并到上面 #3)
2. **query factory 缺 staleTime + invalidate 链** — `friends.query.ts` / `directory.query.ts` / `friend-applies.query.ts` 都有 staleTime + 注释清晰
3. **friend-add vercode 校验** — `friends.api.ts:51` 透传 `Friend.vercode`,注释清晰"后端发的一次性凭证",前端无需预校验
4. **structure-lint 加 contacts → chat 白名单** — structure-lint **不查跨 feature import**(只查目录/文件名/后缀),完全是 spec 误判

## 跨 feature import 真实清单(纯文档化,不动代码)

10 处 `@/features/chat` import,**P4+ 解**(做"通讯录详情面板"时一并):

| 引入符号              | 文件                                                                                                                                                            | 用途                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `ChannelAvatar`       | `contacts-directory.tsx:17`, `friend-list.tsx:5`, `friend-applies.tsx:5`, `friend-add.tsx:5`, `blacklist.tsx:4`, `saved-groups.tsx:5`, `botfather-banner.tsx:3` | 头像渲染                |
| `chatSelectedActions` | `friend-list.tsx:6`, `botfather-banner.tsx:4`                                                                                                                   | 点联系人 / 点 AI 开对话 |
| `ChatMain`            | `contacts.view.tsx:9`                                                                                                                                           | 右栏复用 chat 主容器    |

**未来去向**(P4+):

- `ChannelAvatar` → 抽到 `features/base/components/`(IM 通用 UI)
- `chatSelectedActions` → 抽 `features/base/stores/` 或保留在 chat,让 contacts 通过事件总线 / router 解耦
- `ChatMain` → 替换为"通讯录详情面板"

## 修正后的真实 commit 计划

原 task-list 9 commit → **实际 5 commit**:

| #   | 原计划                                  | audit 后     | 性质                                                                      |
| --- | --------------------------------------- | ------------ | ------------------------------------------------------------------------- |
| 0   | audit                                   | ✅ 本 commit | 已做(本 audit + spec/api-mapping 微修)                                    |
| 1   | query factory 规范化                    | ❌ 取消      | 已规范,spec 误判                                                          |
| 2   | 拼音基建                                | ✅ 降级      | 只改 `friend-list.tsx` 换用 base/lib                                      |
| 3   | sub-page URL state                      | ✅ 保留      | 真违规                                                                    |
| 4   | loader + ensureQueryData                | ✅ 保留      | 真违规                                                                    |
| 5   | friend-add vercode                      | ❌ 取消      | 已实现                                                                    |
| 6   | 视觉对齐                                | ⏸️ 待定      | IC 跑 dev server 后肉眼对比再定,本 audit 不预判;若无明显差距合到 commit 8 |
| 7   | structure-lint 白名单                   | ❌ 取消      | structure-lint 不查 import                                                |
| 8   | 收尾(decisions + MANIFEST + final lint) | ✅ 保留      | 必做(MANIFEST.md 5 行 P1 占位需扩)                                        |

**真实 5 commit**:

- commit 0(本)= audit
- commit 1 = `feat(contacts): friend-list 改用 base/lib/pinyin-bucket`
- commit 2 = `feat(contacts): sub-page 改 URL state(?sub=...)`
- commit 3 = `feat(contacts): 路由 loader + ensureQueryData 预热 directory`
- commit 4 = `chore(contacts): MANIFEST 扩写 + decisions.md + final lint`(含视觉微调若有)

## 后续 spec 同步

commit 0 顺手把 `api-mapping.md` 的 friend/sync method 标 GET(spec 写 POST 是错的),其他保留。task-list.md 在 commit 4 收尾时同步真实状况(写一段"实施期发现:9 commit → 5 commit,详见 audit.md")。

## 给主架构师的请示

- 上面 5 commit 计划 vs 原 9 commit:**4 个 commit 砍掉了**(query factory / vercode / structure-lint 白名单 / Organizational P3+ 已无需 commit)— 是否同意?
- commit 6 视觉对齐留 IC 启动 dev server 肉眼对比再决定,合理?
- audit 是否需要再深一层(比如跑 dev server 走 6 条手动验收看是否 baseline 已通,若已通则进一步简化)?
