# contacts feature

> 通讯录(原 dmworkcontacts):好友列表 + 申请 + 黑名单 + 保存的群 + AI 推荐 + 全员/AI/群 3 段目录。
>
> P1 阶段:占位 view。**P3 阶段(本期)**:audit + 补差(详见 [`.specify/specs/p3-contacts/`](../../../.specify/specs/p3-contacts/))。

## 结构

```
contacts/
├── api/                          contacts 独占业务域(参 P3-matter D-2)
│   ├── friends.api.ts              /v1/friend/{sync,search,apply,remark} + /v1/friends/:uid
│   └── friend-applies.api.ts       /v1/friend/{apply,sure} + /v1/user/reddot/friendApply
├── queries/                      queryOptions 工厂(staleTime 已配)
│   ├── friends.query.ts            好友列表 sync(30 min staleTime)
│   ├── friend-applies.query.ts     新好友申请(60s staleTime)
│   └── directory.query.ts          spaceMembers / myBots / spaceBots / myGroups(5 min staleTime)
├── types/
│   ├── friend.types.ts             Friend(含 vercode 透传)
│   └── friend-apply.types.ts       FriendApply
├── components/
│   ├── contacts-directory.tsx      主目录:3 段手风琴(群/AI/全部)+ 拼音分组(base/lib/pinyin-bucket)
│   ├── friend-list.tsx             首字分组好友列表 + 搜索
│   ├── friend-applies.tsx          新朋友申请 + 接受/删除/清红点
│   ├── friend-add.tsx              搜索 + 发申请(Friend.vercode 透传)
│   ├── blacklist.tsx               黑名单
│   ├── saved-groups.tsx            保存的群
│   └── botfather-banner.tsx        AI 推荐入口卡
└── views/
    └── contacts.view.tsx           中列 sub-page 切换(URL state ?sub=...)+ 右列 ChatMain
```

## 路由

- `/_auth/contacts?sub={directory|applies|add|blacklist|saved-groups}` — 单一路由 + URL search state
- loader 机会主义预热 directory 4 个 query(spaceId 缺失则跳过)

## 复用 base

| base 文件                        | 用途                                                        |
| -------------------------------- | ----------------------------------------------------------- |
| `api/client.ts`                  | IM 主接口 `/v1/` ofetch 实例(**不**像 matter 建独立 client) |
| `api/endpoints/space.api.ts`     | spaceMembers                                                |
| `api/endpoints/robot.api.ts`     | myBots / spaceBots                                          |
| `api/endpoints/group.api.ts`     | myGroups                                                    |
| `api/endpoints/blacklist.api.ts` | blacklist                                                   |
| `api/endpoints/user.api.ts`      | 用户兜底                                                    |
| `lib/pinyin-bucket.ts`           | 拼音首字母分桶(`bucketLetter` + `sortLetters`)              |
| `stores/space.ts`                | 当前 spaceId                                                |
| `stores/auth.ts`                 | 当前 uid                                                    |

## 跨 feature 耦合(已存在,P4+ 解)

10 处 `@/features/chat` import,详见 [`audit.md`](../../../.specify/specs/p3-contacts/audit.md) 跨 feature import 真实清单:

- `ChannelAvatar` × 8 — 头像渲染
- `chatSelectedActions` × 2 — 点联系人/AI 开对话
- `ChatMain` × 1 — 右栏复用

P4+ 做"通讯录详情面板"时一并解;`scripts/structure-lint.ts` 不查跨 feature import,本期纯文档化(详见 [`decisions.md`](../../../.specify/specs/p3-contacts/decisions.md) D-3)。

## P3+ 留项

- ❌ Organizational(企业组织树)— 业务确认前不做
- ❌ 联系人详情字段编辑(改备注 / 群信息)— 强耦合 chat 写路径
- ❌ 子区(thread)列表入口 — 属 chat 域
