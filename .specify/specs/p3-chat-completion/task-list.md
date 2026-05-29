# P3-chat-completion 任务列表

> 24 commit / 5 phase。每完成一个 phase **push 一次**(长分支减少 review 难度)。

## Phase A — 核心增强(7 commit)

### A0. spec 落地(本 commit 已做)

- [x] `docs(p3-chat-completion): spec 三件套 + audit`

### A1. 媒体上传基建(commit A1)

`feat(chat): 媒体上传 API + 上传 hook + 文件大小校验`

- [ ] 建 `features/chat/api/upload.api.ts`:`uploadFile` / `uploadImage` / `uploadVideo` 三函数(若后端统一 `/upload` 则只一个 + type param)
- [ ] 建 `features/chat/hooks/use-upload-progress.hook.ts`:tracked progress + cancel
- [ ] 大小校验 + 类型校验(图片 ≤ 10MB / 文件 ≤ 100MB / 视频 ≤ 500MB,看产品 + 后端)
- [ ] 验收:`pnpm check` 全绿,函数可独立调用(单元测试 / 抽样手测)

### A2. composer 上传入口(commit A2)

`feat(chat): composer 加文件/图片/视频上传入口`

- [ ] composer 工具栏加 3 个图标(Paperclip / Image / Video,from lucide-react)
- [ ] 各自打开 file picker(`<input type="file">` accept 限制)
- [ ] 选完文件 → 调 upload.api → 发对应类型消息(content.type=2/3/4 等)
- [ ] 上传中显示 progress(toolbar 临时态 / 消息 row 占位)
- [ ] 验收:走通 3 种上传

### A3. ReplyBlock 引用展示(commit A3)

`feat(chat): message-row 内嵌 ReplyBlock 引用展示`

- [ ] 建 `features/chat/components/reply-block.tsx`:小卡片(发送者 + 内容片段 + 点击跳转)
- [ ] `message-row.tsx` 检测 `message.reply` 字段 → 渲染 ReplyBlock 在 content 上方
- [ ] 点击 ReplyBlock → 滚动到原消息(若不在视窗则 toast "原消息已不在加载范围")
- [ ] 验收:回复一条 → 对方看到 reply block 可点

### A4. @mention 接收端高亮(commit A4)

`feat(chat): 消息内 @mention 解析 + 高亮 + 点击`

- [ ] `message-renderers/text-renderer.tsx` 加 mention parser(检测 `@<uid>` 模式 + `mention.mention_uids` 字段)
- [ ] 替换为 `<MentionTag uid={...} />` 组件(brand 色)
- [ ] 点击 → 打开 UserInfoModal(若 isBot 则 BotDetailModal)
- [ ] 处理 `@all` 特殊样式
- [ ] 验收:发 @mention → 接收端高亮可点

### A5. 合并转发完整版(commit A5)

`feat(chat): 多选合并转发(mergeforward 真合并)`

- [ ] `selection-toolbar.tsx` 多选 ≥ 2 时,转发改走"合并转发"路径
- [ ] 调 `/v1/messages/forward-merge`(api-mapping A4),body 含 from_message_ids + to_channel + 自动 title
- [ ] forward-modal 加 "合并/逐条" 选项(若 ≥ 2 条)
- [ ] `mergeforward-renderer.tsx` 完善:展开聊天记录(modal 显示原消息列表)
- [ ] 验收:多选 3 条 → 转发到 X → X 看到合并卡 → 点开看 3 条详情

### A6. UserInfo / BotDetail modal 挂入口(commit A6)

`feat(chat): UserInfo / BotDetail modal 挂 chat 入口`

- [ ] mention 点击 → UserInfoModal(已存在 `features/base/components/modals/user-info-modal.tsx`)
- [ ] bot mention 点击 → BotDetailModal(已存在)
- [ ] message-row 头像点击 → 同上
- [ ] 验收:头像 + mention 都能弹卡

### A7. Phase A 收尾(无 commit,push 一次)

- [ ] `pnpm check && pnpm structure-lint` 全绿
- [ ] `git push -u origin refactor/p3-chat-completion`

## Phase B — 5+1 类高级 renderer(6 commit)

### B1. contentType 枚举对齐(commit B0)

`refactor(chat): contentType 枚举对齐后端 MessageContentTypes`

- [ ] 建 `features/chat/lib/content-types.ts`,导出 enum / const
- [ ] 对照旧 `packages/dmworkbase/src/Service/Const.ts` MessageContentTypes 全部值
- [ ] dispatch.tsx switch 用 enum
- [ ] 验收:`pnpm check` 全绿,枚举完整覆盖

### B2-7. 6 类 renderer 各一 commit

每个 `feat(chat): <type>-renderer`:

- [ ] B2 link-card-renderer:抓取卡片(title / desc / image)
- [ ] B3 red-packet-renderer:红包卡片 + 抢红包(若做闭环)
- [ ] B4 card-renderer:通用卡片(对齐旧 Card)
- [ ] B5 markdown-renderer:用 react-markdown(已在依赖里)
- [ ] B6 table-renderer:简单 HTML table(无编辑)
- [ ] B7 chart-renderer:看后端 data shape 选库(echarts-for-react 或 recharts)

每个 commit 验收:贴 mock 数据,渲染对位旧版视觉。

## Phase C — 关注 tab polish(5 commit)

### C1. follow API 补齐(commit C1)

`feat(chat): follow DM / channel API + hooks`

- [ ] `features/base/api/endpoints/follow.api.ts` 补 `/v1/follow/dm` + `/v1/follow/channel`(api-mapping C1)
- [ ] 建 `features/chat/mutations/follow.mutation.ts`:followDm / unfollowDm / followChannel / unfollowChannel
- [ ] onSuccess invalidate sidebar.query + conversations.query

### C2. 子区 follow/unfollow + DM 关注(commit C2)

`feat(chat): 子区 follow/unfollow + DM 关注入口`

- [ ] message-row 子区点击 → 进子区(已有)+ 加 follow toggle 按钮
- [ ] conversation-list DM 行右键菜单加 "关注"
- [ ] follow-list 显示新关注的子区 / DM
- [ ] 验收:DM 关注后出现在关注 tab,子区 follow 后保留在父群下

### C3. 子区 `+N` 折叠(commit C3)

`feat(chat): follow-list 子区超过 N 折叠 +N 按钮`

- [ ] follow-list.tsx 每父群下子区 > 5(可配)时,显示前 5 + `+N` 按钮
- [ ] 点击 +N 展开全部 / 收起
- [ ] 验收:某父群 10 子区 → 默认显示 5 + "+5" → 点开 10

### C4. 跨分组右键菜单(commit C4)

`feat(chat): conversation 右键菜单加 "移动到分组"`

- [ ] conversation-list / follow-list 行右键 context menu 加 "移动到分组" → 弹 category picker
- [ ] 调 `/v1/follow/move`(api-mapping C3)
- [ ] onSuccess invalidate
- [ ] 验收:移动一个会话从 A 组到 B 组,UI 立刻更新

### C5. 拖拽排序 + @dnd-kit(commit C5)

`chore(deps): 装 @dnd-kit + feat(chat): 关注分组拖拽排序`

- [ ] `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
- [ ] follow-list 包 `<DndContext>` + 各 item `<SortableItem>`
- [ ] drag end 调 `/v1/follow/sort`(api-mapping C4),传完整 sorted order
- [ ] onSuccess 不 invalidate(乐观更新),错误 rollback
- [ ] 验收:拖一个会话改顺序,刷新保留

### C6. Phase C 收尾(无 commit,push)

- [ ] 全绿 + push

## Phase D — 体验增强(8 commit)

### D1. 图片大图预览(commit D1)

`feat(chat): 图片大图预览 modal + 视频播放器升级`

- [ ] 建 `features/chat/components/media-viewer-modal.tsx`(图片支持缩放 / 切换;视频用 video tag + 倍速)
- [ ] image-renderer / video-renderer click 时打开
- [ ] 验收:图片可缩放切换;视频可倍速

### D2. 语音波形(commit D2)

`chore(deps): 装 wavesurfer.js + feat(chat): 语音波形 + 进度`

- [ ] 装 wavesurfer.js(或自写 canvas 取舍包大小)
- [ ] voice-renderer.tsx 加波形 + click 进度
- [ ] 验收:语音消息显示波形,可拖动进度

### D3. Emoji 搜索 + sticker(commit D3)

`feat(chat): EmojiPicker 加搜索 + sticker tab`

- [ ] emoji-picker-popover.tsx 加 search input(基于 emoji-mart 或自查)
- [ ] 加 sticker tab(静态包 / 后端拉)
- [ ] 验收:搜 "smile" 出对应 emoji;sticker tab 切换可发

### D4. 群链接分享(commit D4)

`feat(chat): 群链接分享 modal`

- [ ] 建 `features/chat/components/group-link-modal.tsx`
- [ ] 调 `/v1/groups/:no/invite-link`(api-mapping D4)
- [ ] copy to clipboard + 重新生成
- [ ] chat-header / GroupCardModal 加入口
- [ ] 验收:复制链接成功 toast

### D5. 群内搜索(commit D5)

`feat(chat): 群内消息搜索 panel`

- [ ] chat-header 加搜索按钮 → 滑出 search panel(或 modal)
- [ ] 调 `/v1/messages/search`(api-mapping D5)
- [ ] 结果点击 → 跳消息位置(类似 ReplyBlock 跳转)
- [ ] 验收:搜词出结果可点

### D6. 消息收藏 / 星标(commit D6)

`feat(chat): 消息收藏 + 收藏列表 modal`

- [ ] 建 `features/chat/api/favorites.api.ts`(api-mapping D6)
- [ ] message-row context menu 加 "收藏"
- [ ] 建 `features/chat/components/favorites-modal.tsx`:我的收藏列表
- [ ] sidebar / chat-header 加入口
- [ ] 验收:收藏一条 → 列表见到 → 取消 → 列表移除

### D7. 消息编辑(commit D7)

`feat(chat): 消息撤回后编辑(后端支持的话)`

- [ ] message-row context menu 加 "编辑"(条件:自己发的 + 在编辑时限内,后端定)
- [ ] 编辑触发后,composer 进编辑模式(原文 preload + "重新发送")
- [ ] 调 `/v1/messages/:id/edit`(api-mapping D7,若后端支持)
- [ ] 验收:编辑后消息更新,UI 显示"已编辑"标签

### D8. 消息 reaction(commit D8)

`feat(chat): 消息 emoji reaction`

- [ ] message-row 加 reaction bar(hover 显示 + 长按 / 右键加表情)
- [ ] 调 `/v1/messages/:id/reactions`(api-mapping D8)
- [ ] 消息底部展示 reaction list(emoji + 数字)
- [ ] 验收:加 reaction → 双方都看到

### D9. Phase D 收尾(无 commit,push)

- [ ] 全绿 + push

## Phase E — 收尾(2 commit)

### E1. VoiceInput 抽通用组件(commit E1)

`refactor(base): VoiceInput 抽到 features/base/components/voice-recorder/`

- [ ] 把 `use-voice-recorder.hook` + 相关 UI 抽到 `features/base/components/voice-recorder/`
- [ ] chat composer 改用通用组件
- [ ] 验收:chat 语音录制不动行为;matter / summary 可独立 import

### E2. 决策 + 文档同步 + final lint(commit E2)

`chore(chat): D-1~D-N 决策 + spec 同步 + MANIFEST 扩写 + final lint`

- [ ] 起 `decisions.md`(本期发现的真决策)
- [ ] spec.md / api-mapping.md / task-list.md / audit.md 同步
- [ ] `features/chat/MANIFEST.md` 扩写 P3+ 现状
- [ ] vp check --fix 修 markdown
- [ ] 走完整验收清单(spec.md §验收)

## 进度跟踪

启动每 phase 时 `TaskCreate` 把该 phase commits 各建 1 个 task。

## 节奏建议

- **Phase A 完成后**:推 MR 让 user review,确认核心方向后再做 B/C/D
- **或全 phase 完成一次性大 MR**:节省 review 次数,但 review 量大

(待与 user 对齐节奏)
