# contacts feature

> 通讯录(原 dmworkcontacts):**精简版** — 主目录(BotFather + 搜索 + 三段手风琴),无 sub-page。
>
> P1 阶段:占位 view。**P3 阶段(本期)**:audit + 砍冗余 + 视觉对齐(详见 [`.specify/specs/p3-contacts/`](../../../.specify/specs/p3-contacts/))。

## 结构(本期完成态,830 行)

```
contacts/
├── api/
│   └── friends.api.ts              applyFriend / setUserRemark / deleteFriend / searchFriends
│                                   (仅服务跨模块消费者 — chat friend-add-form + base modals)
├── queries/
│   └── directory.query.ts          spaceMembers / myBots / spaceBots / myGroups(5 min staleTime)
├── types/
│   └── friend.types.ts             Friend(API 契约,跨 feature 复用)
├── components/
│   ├── contacts-directory.tsx      主目录:3 段手风琴 + 拼音分组 + 搜索 + AiBadge/GroupTag
│   └── botfather-banner.tsx        AI 推荐入口卡(渐变 #7C5CFC → #00D4AA)
└── views/
    └── contacts.view.tsx           BotFather + Directory + ChatMain 3 段
```

## 路由

- `/_auth/contacts` — 无 URL search state(D-6 决策后 sub-page 全砍)
- loader 机会主义预热 directory 4 个 query(spaceId 缺失则跳过)

## 复用 base

| base 文件                        | 用途                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `api/client.ts`                  | IM 主接口 `/v1/` ofetch 实例(**不**像 matter 建独立 client) |
| `api/endpoints/space.api.ts`     | spaceMembers                                                |
| `api/endpoints/robot.api.ts`     | myBots / spaceBots                                          |
| `api/endpoints/group.api.ts`     | myGroups                                                    |
| `api/endpoints/blacklist.api.ts` | (无直接消费,user-info-modal 间接)                           |
| `api/endpoints/user.api.ts`      | 用户兜底                                                    |
| `lib/pinyin-bucket.ts`           | 拼音首字母分桶(`bucketLetter` + `sortLetters`)              |
| `stores/space.ts`                | 当前 spaceId                                                |
| `stores/auth.ts`                 | 当前 uid                                                    |

## 跨 feature 出口(API 由 contacts 提供,UI 由消费者拥有)

- `applyFriend` / `searchFriends` ← `chat/components/friend-add-form.tsx`(加好友主入口,对齐旧 `chatmenus.addfriend`)
- `applyFriend` ← `features/base/components/modals/{friend-apply,bot-detail}-modal.tsx`
- `setUserRemark` / `deleteFriend` ← `features/base/components/modals/user-info-modal.tsx`
- `Friend` 类型 ← 上述全部
- `directory.query` 的 `spaceMembersQueryOptions` ← `chat/components/{add-members,create-group}-modal.tsx`、`matter/components/{member,assignee}-picker.tsx`、`summary/components/participant-picker.tsx`

## 跨 feature 入口(contacts 消费 chat,P4+ 解)

3 类 10 处 chat 引用,详见 [`audit.md`](../../../.specify/specs/p3-contacts/audit.md):

- `ChannelAvatar` — 头像渲染(P4+ 抽 base)
- `chatSelectedActions` — 点联系人 / AI 开对话(P4+ 改事件总线 / router)
- `ChatMain` — 右栏复用(P4+ 替换为"通讯录详情面板")

## 已砍(D-6 决策,P3+ 不规划重做除非新需求)

- ❌ 新朋友 / 黑名单 / 保存的群 / 加好友 sub-page UI — 旧版 contactsHeaders() 是 dead endpoint,本期已对齐
- ❌ Organizational(企业组织树)
- ❌ 联系人详情字段编辑

## 视觉关键决策

- BotFather banner:固定渐变 `#7C5CFC → #00D4AA 135deg`(inline style,不随主题色)
- AI 徽标:`linear-gradient(90deg, #7B89F4 0%, #9D78F5 100%)` 白字 12px/600(对齐旧 AiBadge)
- 群 tag:`bg-elevated` + `text-secondary` font-medium 10px(对齐旧 `.wk-contacts-group-tag`)
- 手风琴展开:按内容自适应 + 超出时段内滚动(`flex-shrink: 1` + `min-h-0` + `overflow-y-auto`,详见 decisions D-7)
