# P4 Message Rendering — Spec

> 基于 `main` @ `6af84d3`(P3-chat-completion-2 已合并)。
> 目标:消息渲染系统补完 — markdown、文件、AI 协作分组、其他缺失类型。
> 分支:`refactor/p4-message-rendering`

## 一、盘点(2026-06-01)

### 1.1 旧仓 Messages 26 类 vs 新仓 dispatch 15 类

| # | 旧目录 | 新 renderer | 状态 |
|---|---|---|---|
| 1 | Text | `text-renderer.tsx`(119 行) | ⚠️ **缺 markdown**(旧 MarkdownContent.tsx 404 行) |
| 2 | Image | `image-renderer.tsx`(70) | ✅ |
| 3 | Gif | `gif-renderer.tsx`(66) | ✅ |
| 4 | Voice | `voice-renderer.tsx`(214) | ✅ |
| 5 | Video | `video-renderer.tsx`(117) | ✅ |
| 6 | File | `file-renderer.tsx`(62 行) | ⚠️ **缺文本预览/分类型 UI**(旧 680 行) |
| 7 | Card | `card-renderer.tsx`(31) | ✅ |
| 8 | Location | `location-renderer.tsx`(45) | ✅ |
| 9 | Screenshot | `screenshot-renderer.tsx`(17) | ✅ |
| 10 | Mergeforward | `mergeforward-renderer.tsx`(106) | ✅ |
| 11 | Revoke | `revoked-renderer.tsx`(28) | ✅ |
| 12 | System | `system-renderer.tsx`(25) | ✅(覆盖 addMembers / removeMembers / channelUpdate / newGroupOwner) |
| 13 | JoinOrganization | `join-organization-renderer.tsx`(35) | ✅ |
| 14 | ThreadCreated | `thread-created-renderer.tsx`(92) | ✅(P3-2 已补完) |
| 15 | ApproveGroupMember | ❌ | **缺** |
| 16 | LottieSticker(12) / lottieEmojiSticker(13) | ❌ | **缺** |
| 17 | SummaryCard(15) | ❌ | **缺**(可能跨 summary feature 已有) |
| 18 | HistorySplit(-3) | ❌ | **缺**(消息列表里的"以下为新消息"分隔) |
| 19 | Typing(-2) | ❌ | **缺**(对方输入中) |
| 20 | Time(-1) | message-list 内置 TimeDivider | ✅(等价) |
| 21 | Unknown / Unsupport | dispatch fallback | ⚠️ 待确认 |
| 22 | Flame | ❌ | 待确认是否实际用到(阅后即焚?) |
| 23 | SignalMessage | SDK 内置 | ✅ |
| 24 | RTC 9989-9999(11 个子类) | ❌ | 暂不做(P4 范围外) |
| 25 | Base | 不渲染(SDK 类) | n/a |

### 1.2 AI 协作消息分组

旧仓 `Conversation/index.tsx` line 1280-1450 `renderFoldSession`:

- **数据层**:vm 端 `getFoldSessionSummaryState(session)` 把"连续来自同一 AI / 多 AI 协作"的消息聚合成 `session`
- **UI**:
  - 标题:参与者名(`× ` 分隔,>5 折叠成"X 等 N 人") + tag(`AI 助手` / `AI 协作`) + 时间 + 收起/展开按钮
  - 折叠态:摘要消息 + 头像(`foldSessionAvatarIcon`)+ 选中态
  - 展开态:渲染 session 内全部消息
- **判定**:`channelInfo.orgData.robot === 1` 标识 AI bot 频道;参与者 > 1 = AI 协作
- **触发**:summary 类消息(`MessageContentTypeConst.summaryCard` = 15)+ typing 类消息

新仓:**完全未实现**。`message-list.tsx isContinue` 只做了"同发送者 + 5min"的轻量分组,没有 fold session。

### 1.3 已有基础设施

- `dispatch.tsx`:contentType → renderer 分发
- `text-renderer.tsx`:已有 @mention + emoji 解析(单段 text),无 markdown
- `message-list.tsx`:已有 `isContinue` / `shouldRenderBare` / `TimeDivider`
- `group-md-modal.tsx`:**已有 `ReactMarkdown` + `remark-gfm` 依赖**(GROUP.md 编辑器用),可复用

## 二、优先级与拆分

P4 拆 3 个 milestone,建议顺序:

### M1 — Markdown 渲染(text 消息)

**触发**:用户口头优先级 #1 + 改动量适中(text-renderer 替换)
**范围**:
- 抽 `<MarkdownContent>`(对应旧 `Messages/Text/MarkdownContent.tsx` 404 行)
- 接 `react-markdown` + `remark-gfm` + `remark-breaks`(已是依赖)
- 兼容 @mention tag / emoji(post-render 替换文本节点,旧 line 242 的策略)
- 代码块/表格/链接基础样式
- text-renderer.tsx 切到 MarkdownContent

**风险**:streaming 消息(分片到达)需要节流避免每次 re-parse;旧仓 line 318 注释提到"避免 emoji <img> unmount/remount"。

**验收**:`# ## **bold** | tables | code blocks | [link](url)` 都正常渲染,@mention 标签仍蓝色高亮可点。

### M2 — 文件消息渲染深化

**范围**:
- file-renderer.tsx 按 ext 分类:`image / md / html / pdf / office / archive / 其他`
- 缩略图:image ext 显示缩略图;office 显示类型 icon
- 点击行为:预览面板(暂直接下载,真预览面板留 P5)或弹出 viewer
- 旧 File index.tsx 680 行有完整 ext registry,选择"是否抄过来 OR 简化版"待定

**未确定**:文件预览面板(`ThreadPanel filePreview` 分支)集成方案 — chat-main 加 sibling panel 还是独立 viewer。

### M3 — AI 协作消息分组(fold session)

**范围**:
- vm 层:`useFoldSessions(messages)` hook 计算 session 边界(同一 AI 或多 AI 协作连续段)
- 渲染:fold session shell(参与者 + tag + 时间 + 折叠/展开)
- 参与者 > 5 折叠头像组 + tooltip
- 展开后递归渲染 session 内消息
- 摘要消息(`summaryCard` type)单独处理

**依赖**:M1(markdown)完成后,AI 回复的 markdown 内容才能正常显示。

**风险**:vm 计算与现有 `message-list isContinue` 的边界协调 — fold session 内部不应再走 continue 分组。

### M4 — 杂项类型补完(可选 / 见时间)

- ApproveGroupMember(审批群成员):简单系统卡片
- Typing(输入中):channel/conversation 级状态,渲染气泡 3 点动画
- HistorySplit("以下为新消息"分割):message-list 集成
- SummaryCard(15):AI 总结卡(可能复用 summary feature 现有 UI)
- LottieSticker(12/13):lottie 动图(需 `lottie-web` 依赖,先 fallback 显示图片占位)
- Unknown / Unsupport:dispatch fallback 兜底

## 三、约束

- **不引入新依赖**:`react-markdown` / `remark-*` 已是 dep(GROUP.md modal 用),直接复用
- **不重做 message-list 主循环**:M3 fold session 在 message-list 现有结构上加一层 group 包装
- **遵守 CLAUDE.md**:无 `useEffect+fetch`、TanStack Router/Query first、Tailwind v4、shadcn
- **每个 renderer 独立文件**(< 200 行最佳),不堆 god component

## 四、出发点

按 M1 → M2 → M3 → M4 顺序推进。每个 M 独立 commit / 可独立验证。

下一步:**M1 markdown 渲染**实施。

## 五、参考

- 旧 markdown:`packages/dmworkbase/src/Messages/Text/MarkdownContent.tsx`(404 行)
- 旧文件渲染:`packages/dmworkbase/src/Messages/File/index.tsx`(680 行)
- 旧 fold session:`packages/dmworkbase/src/Components/Conversation/index.tsx` line 1280-1450
- 新仓 dispatch:`src/features/chat/message-renderers/dispatch.tsx`
- 新仓 content types:`src/features/base/im/content-types.ts`
