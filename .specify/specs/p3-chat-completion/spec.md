# P3-chat-completion Spec — chat 模块 1:1 复刻补齐

> 单分支多 phase 完成,基于 main 起 `refactor/p3-chat-completion`。
> 沿用 P3-contacts 的 **audit-first** 模板(audit 已完成,见 [audit.md](./audit.md))。

## 目标

把 `src/features/chat/` 从 80% 复刻度提升到 ~100%(模块内功能 1:1 复刻完成),保留 P3+ 跨耦合项给 matter completion 阶段。

**与 P3-contacts 区别**:contacts 是 audit 后"砍冗余 +视觉对齐"(代码量 -44%),chat 是"补缺失 + 模块内增强"(代码量预计 +30%~50%,从 9305 行加到 ~13000-14000)。

## 范围(In Scope)

参用户 4 项决策(2026-05-29 对齐),按 phase 分块:

### Phase A — 核心增强(高影响,模块内)

- **A1 媒体上传**:composer 加文件 / 图片 / 视频 / 上传入口 + S3 上传链路
- **A2 ReplyBlock**:引用消息渲染(quote-renderer)+ message-row 内嵌 reply 展示
- **A3 mention 接收端高亮**:消息内 @uid 解析 + 高亮 / 跳转
- **A4 合并转发完善**:批量多条 → MergeforwardCard 真实合并(目前只支持第一条)

### Phase B — 5 类高级 renderer

- **B1 link-card-renderer**:链接抓取卡片
- **B2 red-packet-renderer**:红包消息 + 抢红包交互
- **B3 card-renderer**:通用卡片(联系人卡 / 链接卡变体)
- **B4 markdown-renderer**:md 富文本
- **B5 table-renderer**:数据表格
- **B6 chart-renderer**:图表(简化版,charts.js 或 echarts 视依赖)

(共 6 类,原计列 5,加 link-card 单独成项)

### Phase C — 关注 tab polish(handoff §D 明列)

- **C1 子区 follow/unfollow + DM 关注**:`/follow/dm`、`/follow/channel` API + UI 入口
- **C2 子区 overflow `+N` 折叠**:父群下子区 > N 时折叠展示
- **C3 跨分组移动右键菜单**:context menu 加 "移动到分组" + category picker
- **C4 拖拽排序**:装 `@dnd-kit` + `/follow/sort` API + drag-drop UI(分组内 + 跨分组)

### Phase D — 体验增强(边缘)

- **D1 图片 / 视频大图预览 modal**:click → modal 全屏 + 缩放(图片)/ 播放器(视频)
- **D2 语音波形 + 进度条**:wavesurfer.js 或 canvas 波形 + click 进度
- **D3 Emoji 搜索 + sticker tab**:EmojiPicker 加搜索框 + sticker 分类
- **D4 群链接分享**:`/group/link` API + 复制链接 modal
- **D5 群内搜索**:chat-header 加搜索按钮 + 群内消息搜索 panel
- **D6 消息收藏 / 星标**:context menu 加 "收藏" + favorite list modal
- **D7 消息编辑**:context menu 加 "编辑" + 走 `/messages/:id/edit` API
- **D8 消息 reaction**:消息长按 / 右键 → emoji reaction + 展示

### Phase E — 收尾

- E1 VoiceInput 抽通用组件到 `features/base/components/voice-recorder/`(供 matter / summary 复用)
- E2 decisions.md / MANIFEST.md 同步实际代码
- E3 final lint + 6 条手动验收

## 不做(P3+ 留)

继承 audit.md §四 P3 标记 + 4 项决策已拍 P3+:

- ❌ **P3-B 跨 matter**:SmartCreateModal / extractMatter / channel-picker / ChatTodoPanel(等 matter completion 一起)
- ❌ 消息撤回后编辑(`message.edit` API 待后端支持)
- ❌ 消息翻译(国际化场景)
- ❌ 视频倍速 / 字幕(高级播放器)
- ❌ Markdown / table / chart 的复杂编辑器(只做渲染)
- ❌ UserInfo / BotDetail modal(已在 features/base/components/modals 存在,只需挂入口,合到 Phase A 一并)
- ❌ 通知@我提醒(系统通知集成)

## 验收

- `pnpm check` 0 errors
- `pnpm structure-lint` 0 violations(若新依赖装入,structure-lint 不受影响)
- 手动验收清单(分 phase 写在各 task):
  - Phase A:发图 / 发文件 / 发视频走通 + 回复消息可见 reply block + @mention 高亮 + 多选转发合并卡可见
  - Phase B:6 类 renderer 各贴 1 条 mock 数据,渲染正确不 fallback 到 system-renderer
  - Phase C:子区可 follow/unfollow,DM 可加关注,拖拽改顺序刷新保留,右键菜单移动跨分组
  - Phase D:点图大图,语音见波形,emoji 搜索 + sticker 切换,群链接复制,群内搜索定位消息,收藏列表,编辑消息,reaction emoji

## 旧项目源参考(只读)

| 关注点 | 旧路径 |
| --- | --- |
| ReplyBlock | `packages/dmworkbase/src/ui/message/ReplyBlock/` |
| MergeforwardCard | `packages/dmworkbase/src/ui/message/MergeforwardCard/` |
| 媒体上传 | `packages/dmworkbase/src/Components/MessageInput/` |
| 5 类 renderer | `packages/dmworkbase/src/ui/message/` 各子目录 |
| Voice 通用组件 | `packages/dmworkbase/src/Components/VoiceRecorder/` + `VoiceInput/` |
| 关注分组拖拽 | `packages/dmworkbase/src/Components/ConversationListWithCategory/` + dnd 相关 |
| ImageViewer | `packages/dmworkbase/src/Components/ImageViewer/` |
| 群链接分享 | `packages/dmworkbase/src/Components/GroupLink/` |

## 新项目集成点(沿用 contacts spec)

| 要做的事 | 怎么做 |
| --- | --- |
| HTTP 请求 | `import { api } from "@/features/base/api/client"` |
| Query | `queryOptions` + route loader `ensureQueryData` |
| Mutation | `useMutation` + `invalidateQueries` 链 |
| URL state | `implement-typed-search-params` skill |
| 路由 loader | `implement-route-with-query-loader` skill |

## 工作流约束

继承 P3-contacts 工作流约束(skill / TanStack docs / 单 commit 单子功能)。

**新增约束**:
- **跨 feature 砍 / 增组件前必须全仓库 grep 引用**(吃过 P3-contacts 亏)
- **新装依赖(@dnd-kit / wavesurfer / echarts 等)** 单独 commit + 注 P3+ 是否会用到
- **每 phase 完成时 push 一次** — 长分支减少 review 难度

## 起点

```bash
git fetch origin && git checkout -b refactor/p3-chat-completion origin/main
```

读完 spec → 读 [audit.md](./audit.md) → 读 [api-mapping.md](./api-mapping.md) → 按 [task-list.md](./task-list.md) phase 顺序 `TaskCreate` 跟踪。
