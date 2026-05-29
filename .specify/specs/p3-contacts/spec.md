# P3-contacts Spec — 通讯录 feature(精简版 + 视觉对齐)

> 单 session 独立完成,基于 main 起 `refactor/p3-contacts` 分支。

## 目标(本 spec 范围)

把 `src/features/contacts/` 现有 1491 行精简到 830 行,完成视觉对齐旧 dmworkcontacts 截图,达到 P3 验收标准。

**与 P3-matter 起步状态本质不同** — matter 当时缺基建 + 要反转 endpoint 位置(D-2)+ 删超范围(D-3)+ 设计稿扩 MVP(D-4)。contacts 反过来,起步即基本现代化(ofetch / TanStack Query v5 / file route / shadcn / 0 `any`,endpoint 已按 D-2 正确分布)。

**实施期发现**(audit + 截图视觉验证):**P1 阶段写下的 sub-page UI(新朋友 / 黑名单 / 保存的群 / 加好友 header + 4 入口)在旧版 dmworkcontacts 根本不存在** — 注册到 `contactsHeaders()` dead endpoint 没渲染点;加好友的真实入口在 chat 右上"+"号菜单。所以本期最终方向反转为 **审计 → 砍冗余 → 视觉对齐**(见 [`decisions.md`](./decisions.md) D-6)。

## 范围(In Scope)

### 保留 + 完善

- `contacts-directory.tsx`(534 行,3 段手风琴 + 拼音分组 + 搜索 + AiBadge/GroupTag)
- `botfather-banner.tsx`(39 行,渐变卡)
- `contacts.view.tsx`(30 行,BotFather + Directory + ChatMain)
- `directory.query.ts`(57 行,4 个 queryOptions)
- `friends.api.ts`(63 行,4 函数仅服务跨模块)
- `friend.types.ts`(41 行,Friend 跨 feature 契约类型)

### 砍除(D-6,详见 [`audit.md`](./audit.md))

- 10 文件:`friend-applies` / `friend-add` / `blacklist` / `saved-groups` / `friend-list` 组件 + `friend-applies` / `friends` queries + `friend-applies` api + `friend-apply` types
- `contacts.view.tsx` 中 header + 4 icon + sub-page 切换逻辑
- `_auth.contacts.tsx` 中 `contactsSearchSchema` + `validateSearch`
- `friends.api.ts` 中 `syncFriends`(无消费者)

### 修齐 / 接基建

- `friend-list.tsx` 自定义 `bucketLetter` 改用 `features/base/lib/pinyin-bucket`(完成于 commit 131a9e9,后该文件被 D-6 砍除)
- `views/contacts.view.tsx` `useState<SubPage>` 改 URL state(完成于 commit 6c7efb8,后被 D-6 反转)
- `_auth.contacts.tsx` 加 `ensureQueryData` 预热 directory 4 query(完成,sub URL state 已被 D-6 移除但 loader 保留)

### 视觉对齐(D-8)

- BotFather banner:渐变改 `#7C5CFC → #00D4AA 135deg`(inline style)
- 搜索框:`bg-bg-elevated` + `1.5px transparent` border + `focus brand`
- Filter chips:active `brand/8 浅底 + brand/20 边 + brand 字`
- AI 徽标:抽 `AiBadge` 紫渐变白字(对齐旧 `dmworkbase/Components/AiBadge`)
- 群 tag:抽 `GroupTag` `bg-elevated` font-medium 10px(对齐旧 `.wk-contacts-group-tag`)
- 群 row:删 `member_count` 数字(旧版不显示)
- 手风琴展开:按内容自适应 + 超出时段内滚动(D-7)

### 加好友跨模块归属(D-6)

- `chat/components/friend-add-form.tsx`(新增,从 contacts 移植 + 改名)
- `chat/components/friend-add-modal.tsx` 改用本地 `FriendAddForm`
- contacts 提供 API(`searchFriends` + `applyFriend` + `Friend` 类型),UI 完全归 chat

## 不做(P3+ / P4+ 留)

- ❌ **Organizational(企业组织树)** — 旧 `dmworkcontacts/src/Organizational/` 存在,业务侧未明确仍需
- ❌ **解耦右栏 `<ChatMain />`** — 当前 `contacts.view.tsx` 已挂 chat 主容器,不是本期新建的耦合;P4+ 做"通讯录详情面板"时一并解
- ❌ 联系人详情字段编辑(改备注 / 群信息编辑等)— 强耦合 chat 写路径
- ❌ 子区(thread)列表入口 — 属 chat 域

## 验收

- `pnpm check` 0 errors / 5 warnings(全在 contacts 预存在 useMemo dep 警告,本期不动)
- `pnpm structure-lint` 0 violations
- 跑 dev server 6 条手动验收:
  1. 进 `/contacts`,看到 BotFather 卡 + 搜索 + 三段手风琴(无 header / 无 4 icon,对齐旧版)
  2. BotFather 卡渐变 `#7C5CFC → #00D4AA`,可点击进对话
  3. 三段手风琴 one-expanded 模式:展开段按内容高,内容少时下方紧贴下一折叠 header,内容多时段内自滚
  4. AI 徽标紫渐变白字 12px,群 tag 灰底 font-medium 10px,均无 member_count 数字
  5. directory 全部联系人段:filter chips(全部 / AI / 人类)active brand/8 浅底,数量对(`all = humans + bots`)
  6. directory 拼音分组覆盖中英文混(陈 / 张 / Alice / `#` 桶都对)
- 加好友跨模块:chat 右上 "+" 菜单 → 添加朋友 modal → `FriendAddForm` 搜索 + 申请走通

## 旧项目源文件参考(只读,不改)

| 关注点                         | 旧项目路径                                                | 备注                                                             |
| ------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| 主目录(虚拟列表 + 拼音 + 3 段) | `octo-web/packages/dmworkcontacts/src/Contacts/index.tsx` | 视觉参考,**不**照搬 `WKApp.dataSource.contactsSync`              |
| 主目录 CSS                     | `octo-web/packages/dmworkcontacts/src/Contacts/index.css` | BotFather 渐变 / 搜索框 / chip / group-tag / role-badge 全部对位 |
| 加好友(已搬 chat)              | `octo-web/packages/dmworkcontacts/src/FriendAdd/`         | 已搬到 `chat/components/friend-add-form.tsx`                     |
| AiBadge 组件                   | `octo-web/packages/dmworkbase/src/Components/AiBadge/`    | 渐变色 / 字号 / 圆角 / padding 全对位                            |
| Organizational(企业组织)       | `octo-web/packages/dmworkcontacts/src/Organizational/`    | **本期跳过**,P3+ 评估                                            |

## 工作流约束

继承 P3-matter spec.md 工作流约束(hook / skill / TanStack docs / 7 步方法论 / 单 commit 单子功能)。
