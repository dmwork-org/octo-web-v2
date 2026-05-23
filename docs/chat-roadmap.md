# Chat 模块迁移路线图

> 目标:1:1 复刻旧项目 `octo-web` 的 Chat 全部能力到新项目 `octo-web/refactor-2`。
>
> 本文是 chat 子系统的**完整任务清单**和**阶段映射**。每个子任务必须在对应 P 阶段
> 落地,缺一不可。计划顶层路线见 `~/.claude/plans/users-nancy-...-rabbit.md`。
>
> **盘点来源**:`packages/dmworkbase/src/{Messages,Components,Pages/Chat,Service}` 全部子目录。
> 截止 2026-05-23。

---

## 进度看板

| 子模块            | P2-A 已完成                                                                                                        | 剩余                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| IM 连接生命周期   | ✅ Provider+Status+ConnectionBadge+断线自动重连+被踢回登录                                                         | —                                                                                        |
| SDK 必备 callback | ✅ syncConversations / channelInfo / syncSubscribers(空) / syncMessages / messageReaded(空)                        | 其余 callback 见 P2-B                                                                    |
| Convert 转换      | ✅ 最小版(Conversation channel/unread/timestamp/lastMessage;Message id/seq/channel/from/timestamp/payload→content) | extra 字段补完 / Reaction / Stream / 外部群字段                                          |
| 会话列表          | ✅ 列表 + 真名 + lastMessage digest + unread badge                                                                 | 置顶 / 免打扰 / 提醒 / 分类分组 / 拖拽排序 / Space 过滤                                  |
| 消息历史          | ✅ Text-only 一页 + 自动滚到底                                                                                     | 虚拟滚动 + 无限滚动 + 18 类 renderer + 已读/撤回/失败重发                                |
| 发送              | ✅ Text-only Composer(Enter/Shift+Enter)                                                                           | 富文本(TipTap) / @ / 表情 / 图片文件 / 截屏 / 录音 / Lottie / 草稿 / 引用回复 / 多选转发 |

---

## P2-B(W5 后半)— IM 主路径补完(必做,plan 验收"双 tab ≤500ms")

> ⚠️ **P2-B1 虚拟滚动**:用户拍板延后(实现难度大,业务必要性低)。
> 默认普通滚动撑当前规模(单会话 30 条历史+实时增量),性能压力出现再回头做。
> 进 P4 backlog,不阻塞 P2-B 其他 11 项。
>
> ⚠️ **P2-B10 MessageStream**:延后到 P3 AI bot 业务起步时实现。
> 原因:SDK 1.3.5 原生不支持 streamFlag/streams 字段(旧项目用 `as any` 强 patch
> 后端 wire 协议字段名不明,需要业务驱动时跟后端对齐契约后再做。
> P3 标记 `P3-C-stream`。

| ID     | 任务                                                                      | 旧项目对照                                                 | 验收                       |
| ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| P2-B1  | ~~虚拟滚动 MessageList~~ **延后到 P4 backlog**(用户决策 2026-05-23)       | `Components/Conversation/MessageList`                      | —                          |
| P2-B2  | 无限滚动历史(`useInfiniteQuery` + 上拉拉旧)                               | `Conversation/vm.ts::syncMessages`                         | 翻 N 页无重复无乱序        |
| P2-B3  | 4 类基础 renderer:Text(已)/ Image / File / System                         | `Messages/{Text,Image,File,System}`                        | 4 类气泡视觉 1:1           |
| P2-B4  | Image renderer + 预览 + 下载                                              | `Messages/Image` + `Components/ImageToolbar`               | 缩略图 / 全屏 / 复制图片   |
| P2-B5  | File renderer + 预览(PDF)                                                 | `Messages/File` + `Components/FilePreviewPanel/FileViewer` | 文件名/大小/下载/PDF 内嵌  |
| P2-B6  | 上传任务 callback(`messageUploadTaskCallback` + `MediaMessageUploadTask`) | `dmworkdatasource/src/task.ts`                             | 上传进度 / 失败重试 / 取消 |
| P2-B7  | 消息状态(发送中/失败/重发) + ChatManager taskListener                     | `module.tsx::taskManager.addListener` 489-512              | 失败小红点 + 点击重发      |
| P2-B8  | 消息撤回(`message/revoke` + remoteExtra.revoke)                           | `Messages/Revoke` + `ContextMenus.revoke`                  | "你撤回了一条消息"         |
| P2-B9  | Reactions(消息表情回复)                                                   | `Message.reactions`                                        | 长按表情条 + 计数聚合      |
| P2-B10 | ~~MessageStream(AI 流式输出)~~ **延后到 P3 AI bot 起步**(2026-05-23)      | `MessageStream` SDK 类                                     | —                          |
| P2-B11 | Convert 完整版(extra/外部群字段/MessageExtra/Reaction)                    | `Service/Convert.ts`                                       | 旧消息字段对齐             |
| P2-B12 | 已读未读 + messageReadedCallback                                          | `MessageRead` + `messageReadedCallback`                    | 群消息已读人数             |

---

## P3(W6-W8)— Chat 富 UI 与高级交互(业务平行起步)

| ID     | 任务                                                                       | 旧项目对照                                                                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-C1  | TipTap 富文本 Composer(替代 textarea)                                      | `Components/MessageInput` + TipTap 设置                                                                                                                                                                                               |
| P3-C2  | @ 提及(MentionMenu + UserSelect 弹层)                                      | `Components/UserSelect` + EmojiToolbar mention                                                                                                                                                                                        |
| P3-C3  | 表情 EmojiToolbar + EmojiService                                           | `Components/EmojiToolbar` + `Service/EmojiService`                                                                                                                                                                                    |
| P3-C4  | 文件上传工具栏 FileToolbar(图片+文件 dropzone)                             | `Components/FileToolbar`                                                                                                                                                                                                              |
| P3-C5  | 截屏 Screenshot renderer + ScreenshotContent                               | `Messages/Screenshot`                                                                                                                                                                                                                 |
| P3-C6  | 草稿持久化(ConversationExtra.draft)                                        | `syncConversationExtrasCallback`                                                                                                                                                                                                      |
| P3-C7  | 引用回复 Reply + Mergeforward(转发合并)                                    | `Messages/Mergeforward` + `Components/MergeforwardMessageList`                                                                                                                                                                        |
| P3-C8  | 消息上下文菜单 ContextMenus(复制/复制图/转发/回复/多选/撤回/创建子区)      | `Components/ContextMenus` + `module.tsx::registerMessageContextMenus`                                                                                                                                                                 |
| P3-C9  | 转发 Modal + ConversationSelect                                            | `Components/ForwardModal` + `Components/ConversationSelect`                                                                                                                                                                           |
| P3-C10 | 多选 MultiSelect Panel + 批量操作                                          | `Components/Conversation` 多选模式                                                                                                                                                                                                    |
| P3-C11 | 全局搜索 GlobalSearch                                                      | `Components/GlobalSearch`                                                                                                                                                                                                             |
| P3-C12 | 频道设置全套(基础/成员/群公告/GROUP.md/二维码/备注/管理/我的昵称/子区设置) | `Components/ChannelSetting` + `module.tsx::registerChannelSettings`                                                                                                                                                                   |
| P3-C13 | 用户信息 UserInfo(备注/解除好友/拉黑/来源/黑名单提示)                      | `Components/UserInfo` + `module.tsx::registerUserInfo`                                                                                                                                                                                |
| P3-C14 | Typing 输入中状态(addCMDListener typing)                                   | `Messages/Typing` + `Service/TypingManager`                                                                                                                                                                                           |
| P3-C15 | 在线状态(`onlineStatus` CMD)                                               | `module.tsx::cmdListener` 384-398                                                                                                                                                                                                     |
| P3-C16 | 子区(Thread)创建/进入/离开/列表                                            | `Components/{ThreadCreate,ThreadCreateModal,ThreadIndicator,ThreadList,ThreadPanel}` + `Service/Thread.ts`                                                                                                                            |
| P3-C17 | 提醒(Reminder)项 + syncRemindersCallback                                   | `Messages` mention + `module.tsx::syncReminders`                                                                                                                                                                                      |
| P3-C18 | 群成员管理(Subscribers + ContactsSelect)                                   | `Components/Subscribers` + `setSyncSubscribersCallback` 完整版                                                                                                                                                                        |
| P3-C19 | 频道头像 ChannelAvatar 上传                                                | `Components/ChannelAvatar`                                                                                                                                                                                                            |
| P3-C20 | 频道二维码 ChannelQRCode                                                   | `Components/ChannelQRCode`                                                                                                                                                                                                            |
| P3-C21 | 会话列表分组分类(Category/Grouped View)                                    | `Components/{ChatConversationList,ConversationListGrouped,ConversationListWithCategory,CategoryHeader,CategorySection,UngroupedSection,CategoryEmptyState,CreateCategoryModal,DeleteCategoryModal,AddCategoryButton,MoveToGroupMenu}` |
| P3-C22 | 会话拖拽排序(`@dnd-kit`)                                                   | 同上 + `useDndList`(P4 通用)                                                                                                                                                                                                          |
| P3-C23 | Space 过滤 + Space 切换头部 + Space 隔离消息                               | `Service/SpaceService` + `shouldSkipChannelForSpace`                                                                                                                                                                                  |
| P3-C24 | Space 全套(创建/加入/管理/成员/设置/邀请)                                  | `Components/{SpaceList,SpaceItem,SpaceCreate,SpaceMembers,SpaceSettings,SpaceAvatar,JoinSpaceModal,JoinSuccessToast}`                                                                                                                 |
| P3-C25 | 桌面通知 + 提示音 + favicon 角标(已下线但保留代码路径)                     | `Utils/notificationUtil` + `module.tsx::sendNotification/tipsAudio`                                                                                                                                                                   |

---

## P4(W9-W10 上)— 富 UI 能力组件(已在 plan 第四节)

> 这些是**通用** UI 组件,被 chat 和其他 feature 共享。落 `src/components/{rich,media,data}`。

| ID     | 任务                                                             | chat 哪里用到                               |
| ------ | ---------------------------------------------------------------- | ------------------------------------------- |
| P4-D1  | `components/rich/Editor.tsx`(TipTap)                             | Composer / Group MD 编辑器                  |
| P4-D2  | `components/rich/Markdown.tsx`(remark)                           | 系统消息 / GROUP.md 渲染                    |
| P4-D3  | `components/rich/Katex.tsx`                                      | AI 回复内的公式                             |
| P4-D4  | `components/media/PdfViewer.tsx`(@react-pdf-viewer)              | 文件预览                                    |
| P4-D5  | `components/media/Lottie.tsx`                                    | LottieSticker / LottieEmojiSticker renderer |
| P4-D6  | `components/media/VoiceRecorder.tsx`(MediaRecorder + WaveCanvas) | Voice 录制                                  |
| P4-D7  | `components/media/VoicePlayer.tsx`(Howl + benz-amr)              | Voice 播放                                  |
| P4-D8  | Excel 导出 hook `useExcelExport`(xlsx)                           | Mergeforward 导出 / chat 全选导出           |
| P4-D9  | DnD `useDndList`(@dnd-kit)                                       | 会话列表分类拖拽(P3-C22 依赖)               |
| P4-D10 | Hotkeys(@tanstack/react-hotkeys)                                 | 全局快捷键 / Composer 快捷键                |

---

## P4(W10 中)— Chat 剩余渲染类型 + 边角

| ID     | 任务                                              | 旧项目对照                                                 |
| ------ | ------------------------------------------------- | ---------------------------------------------------------- |
| P4-E1  | Card(名片)renderer                                | `Messages/Card`                                            |
| P4-E2  | Gif renderer + 工具                               | `Messages/Gif`                                             |
| P4-E3  | Voice renderer(VoiceCell)                         | `Messages/Voice` + `VoiceInputButton` + `WaveCanvas`       |
| P4-E4  | Video renderer(VideoCell, smallVideo)             | `Messages/Video`                                           |
| P4-E5  | Location renderer                                 | `Messages/Location`                                        |
| P4-E6  | LottieSticker renderer                            | `Messages/LottieSticker`                                   |
| P4-E7  | HistorySplit renderer(历史分割线)                 | `Messages/HistorySplit`                                    |
| P4-E8  | Time renderer                                     | `Messages/Time`                                            |
| P4-E9  | JoinOrganization renderer                         | `Messages/JoinOrganization`                                |
| P4-E10 | ApproveGroupMember renderer + 业务接口            | `Messages/ApproveGroupMember`                              |
| P4-E11 | ThreadCreated renderer                            | `Messages/ThreadCreated`                                   |
| P4-E12 | SignalMessage renderer(端到端加密占位)            | `Messages/SignalMessage`                                   |
| P4-E13 | SummaryCard renderer(智能总结卡片,contentType=15) | `Messages/SummaryCard`                                     |
| P4-E14 | Flame(阅后即焚)renderer                           | `Messages/Flame`                                           |
| P4-E15 | Unsupport / Unknown renderer 完整版               | `Messages/{Unknown,Unsupport}`                             |
| P4-E16 | Bot Detail Modal                                  | `Components/BotDetailModal`                                |
| P4-E17 | AI Badge / Realname Verified Badge                | `Components/{AiBadge,RealnameVerifiedBadge}`               |
| P4-E18 | Persona Settings(OBO 授权管理)                    | `Components/PersonaSettings`                               |
| P4-E19 | Slash Command Menu(Composer / 命令)               | `Components/SlashCommandMenu`                              |
| P4-E20 | 截屏 Screenshot renderer + 截屏发送               | `Messages/Screenshot` + `Components/Conversation` 截屏入口 |

---

## P5(W10 后半)— 双线对账 + 灰度

- chat 模块按"5 接口 + 关键事件"埋点,与旧线对照
- 灰度 5% → 25% → 100% 中,chat 是主路径,任何 4xx/5xx 抬头先回退

---

## 完整性自检 — 旧项目 chat 子系统覆盖

下面这些**全部**在上面阶段中归位,不会遗漏。任何遗漏视为 bug:

**Messages/ 子目录(20 类 renderer)**:
ApproveGroupMember(P4-E10) / Card(P4-E1) / File(P2-B5) / Flame(P4-E14) / Gif(P4-E2)
/ HistorySplit(P4-E7) / Image(P2-B4) / JoinOrganization(P4-E9) / Location(P4-E5)
/ LottieSticker(P4-E6) / Mergeforward(P3-C7) / Revoke(P2-B8) / Screenshot(P3-C5/P4-E20)
/ SignalMessage(P4-E12) / SummaryCard(P4-E13) / System(P2-B3) / Text(P2-A3✅) / ThreadCreated(P4-E11)
/ Time(P4-E8) / Typing(P3-C14) / Unknown+Unsupport(P4-E15) / Video(P4-E4) / Voice(P4-E3)

**Components/ 关键(80+ 中只列 chat 相关)**:
ChannelAvatar(P3-C19) / ChannelQRCode(P3-C20) / ChannelSetting(P3-C12)
/ ChatConversationList + ConversationList + ConversationListGrouped + ConversationListWithCategory(P3-C21)
/ ConnectionStatus(✅) / ContextMenus(P3-C8) / Conversation(P2-A3✅+P2-B 补完)
/ EmojiToolbar(P3-C3) / FilePreviewPanel + FileViewer(P2-B5) / FileToolbar(P3-C4)
/ ForwardModal + ConversationSelect(P3-C9) / FriendApply(归 contacts feature)
/ GlobalSearch(P3-C11) / GroupCard + GroupManagement + GroupMdEditor(P3-C12)
/ ImageToolbar(P2-B4) / MeInfo(归 base/profile) / MergeforwardMessageList(P3-C7)
/ MessageInput(P3-C1) / NavRail(✅) / PersonaSettings(P4-E18) / PopupMenus(归 base/ui)
/ QRCodeMy(归 base/profile) / SidebarTabBar(归 base/layout 待评估)
/ SlashCommandMenu(P4-E19) / Subscribers(P3-C18) / SpaceList...(P3-C24)
/ Thread*(P3-C16) / UserInfo(P3-C13) / UserSelect(P3-C2/P3-C18)
/ VoiceInputButton + WaveCanvas(P4-D6/P4-E3) / WK*(归 semi-bridge / base/ui)

**Service/ 关键**:
APIClient(✅) / ChannelSetting(P3-C12) / Convert(P2-A4✅+P2-B11)
/ DataSource/DataProvider(分散到各 endpoints,P2-A4✅+P2-B6) / EmojiService(P3-C3)
/ ProhibitwordsService(P4 评估必要性) / SpaceService(P3-C23) / Thread(P3-C16)
/ TypingManager(P3-C14)

---

## 当前阶段决策

P2-A 已交付**最小可发文本闭环**(登录→连接→列表→历史→发送 全通)。
依本路线图,**P2-B(W5 后半)** 是 IM 主路径补完(虚拟滚动 / Image/File / 已读 / 撤回 / Reactions / Stream),plan 验收强相关。
**P3(W6-W8)** 把 chat 高级交互(富文本/转发/搜索/Space/子区/分组)和 5 个业务 feature 平行铺开。
**P4(W9-W10 上)** 收尾通用富 UI 组件 + 剩余消息类型。

**建议**:

- 收尾 P2-A4(已合 8a36d77),不再继续在 chat 上做新东西
- 进 **P2-B**(IM 主路径补完)— 跨度 ~1 周,plan 节点上写好的内容
- 然后并行 P3-C(chat 高级)+ P3 业务 feature

不会跳过,不会遗忘 — 任何缺漏都是本路线图的 bug,我会持续维护本文档。
