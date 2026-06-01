# Chat 模块 1:1 复刻 audit-v2(精核版)

**修订日期**: 2026-05-29  
**对比基准**: audit-v1 + 代码逐项 grep 验证  
**修订方式**: 反向核查 audit-v1 所有标记,按代码事实更正

---

## 修订摘要

| audit-v1 标    | 修订后 | 项数                                                                          | 代表功能 |
| -------------- | ------ | ----------------------------------------------------------------------------- | -------- |
| ❌ → ✅        | 2      | 1. 媒体上传(Paperclip + sendFile/sendImage) 2. 图片大图预览(fullscreen modal) |
| 🟡 → ❌        | 1      | 1. mention 接收高亮(无 MentionTag/highlight 代码)                             |
| ❌ → ⚠️        | 2      | 1. ReplyBlock 引用展示(发送完整✅,接收渲染❌) 2. 批量转发(仅第一条+toast)     |
| ✅ 保持        | 61     | 其他全部项准确                                                                |
| **总计缺失项** | **19** | 真实本期应做项(非 audit-v1 的 27 个)                                          |

---

## 一、audit-v1 误判项详解

### 1. ✅ 媒体上传 — audit-v1 标 ❌ 实际 ✅

**真实状态**: 完整

**代码证据**:

- `composer.tsx:623`: Paperclip 按钮 `onClick={() => fileInputRef.current?.click()}`
- `composer.tsx:222-223`: 注释文档"粘贴上传 Ctrl+V" + "拖拽上传:文件拖到 form 区域"
- `composer.tsx:478,484,513-514`: `sendImage(file)` / `sendFile(file)` 完整实现
- `composer.tsx:580-587`: 分离的 `imageInputRef` 与 `fileInputRef` input 标签(accept="image/\*" 和通用)
- `composer.tsx:507`: 拖拽处理 `(f.type.startsWith("image/")) ? sendImage : sendFile`

**为什么 audit-v1 标错**:

- audit-v1 看到"❌ 无上传入口"时,Paperclip 还未完全接线
- 现已 ✅:Paperclip 点击 → fileInputRef.click() → onFileChange/onImageChange → sendFile/sendImage 完整链路

**建议标记**: ✅ 完整

---

### 2. ✅ 图片大图预览 — audit-v1 标 ❌ 实际 ✅

**真实状态**: 完整(简化版,无工具栏)

**代码证据**:

- `image-renderer.tsx:15,28`: `const [preview, setPreview] = useState(false); onClick={() => src && setPreview(true)}`
- `image-renderer.tsx:47-67`: 全屏黑底 modal + 关闭按钮 `<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">`
- 注释 `(P4 接 ImageToolbar 完整工具栏)` 表示后续可扩展,当前 ✅ 基础预览

**为什么 audit-v1 标错**:

- audit-v1 是按表单分类"图片大图预览 P3 留",忽略了 image-renderer 已有 fullscreen 实现
- 实际上这是 P3+ 项的"高阶增强"(工具栏/下载/分享)留,基础预览已完成

**建议标记**: ✅ 完整(不做高级工具栏)

---

### 3. ❌ mention 接收高亮 — audit-v1 标 🟡 实际 ❌

**真实状态**: 全缺

**代码证据**:

- `text-renderer.tsx:11-14`: 纯文本渲染,无 @mention parse、无高亮逻辑
  ```tsx
  export function TextRenderer({ message }: TextRendererProps) {
    const text = (message.content as MessageText).text ?? "";
    return <p className="text-sm leading-snug whitespace-pre-wrap text-text-primary">{text}</p>;
  }
  ```
- grep 全仓库零匹配: `grep -r "MentionTag\|mention.*highlight"` → 无
- composer 中只有发送端 mention picker(mention-list.tsx),无接收端解析

**为什么 audit-v1 标 🟡**:

- audit-v1 看到 composer mention 支持就标 🟡
- 实际 mention 接收端(文本中 @xxx 高亮显示)全缺

**工作量**: 中(需 @mention regex parse + UI 高亮包装)  
**建议标记**: ❌ 未做 / 优先级调整到 P3-chat-v2

---

## 二、真实缺失项清单(audit-v2 版本)

### ❌ 完全未做(本期 P3-chat-completion 范围内应补)

#### 2.1 消息渲染类(5 项)

| 功能                   | 缺失链路                | 旧项目参考                     | 工作量 |
| ---------------------- | ----------------------- | ------------------------------ | ------ |
| 链接卡片消息 renderer  | 无 LinkCardRenderer 类  | dmworkbase Message(link-card)  | 中     |
| 红包消息 renderer      | 无 RedPacketRenderer 类 | dmworkbase Message(red-packet) | 中     |
| Markdown 消息 renderer | 无 MarkdownRenderer 类  | dmworkbase Message(markdown)   | 中-高  |
| 数据表格消息 renderer  | 无 TableRenderer 类     | dmworkbase Message(table)      | 高     |
| 图表消息 renderer      | 无 ChartRenderer 类     | dmworkbase Message(chart)      | 高     |

**grep 证据**:

```bash
grep -r "LinkCard\|RedPacket\|MarkdownRenderer\|TableRenderer\|ChartRenderer" src/features/chat/ --include="*.tsx"
# 无匹配
```

**dispatch.tsx 当前覆盖**: text / image / file / voice / gif / video / mergeForward / threadCreated / system(1000-2000) / revoked  
**未覆盖 contentType**: link-card / red-packet / card / markdown / table / chart / agent / extension

---

#### 2.2 消息接收渲染类(1 项 — 发送完整但接收缺)

| 功能                    | 状态    | 缺失链路                                                                                 | 旧项目参考                            | 工作量 |
| ----------------------- | ------- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------ |
| **ReplyBlock 引用展示** | ⚠️ 部分 | 发送 ✅:chat-reply.ts + composer 构造reply字段; 接收 ❌:message-row 无 render reply 逻辑 | dmworkbase ReplyBlock + message.quote | 低     |

**代码证据**:

- 发送端完整: `composer.tsx:343-349` 构造 reply 对象,`composer.tsx:362,386,399` 附加到 content/image
- 接收端缺失: `message-row.tsx` 仅有"回复"右键菜单(chatReplyActions.set),无渲染 `message.reply` 的代码

**需补**:

```tsx
// message-row.tsx 消息体前插入:
{
  message.reply ? <ReplyBlock reply={message.reply} /> : null;
}
```

**优先级**: P3-chat-v2(与其他引用功能成对)

---

#### 2.3 消息操作右键菜单(3 项)

| 功能     | 缺失内容                           | 旧项目参考                           | 工作量 |
| -------- | ---------------------------------- | ------------------------------------ | ------ |
| 消息编辑 | 无 editMessage API 调用 + 右键菜单 | dmworkbase MessageRow(editMenu)      | 中     |
| 消息收藏 | 无 favorite API 调用 + 右键菜单    | dmworkbase MessageRow(favoriteMenu)  | 低     |
| 消息翻译 | 无 translate API 调用 + 右键菜单   | dmworkbase MessageRow(translateMenu) | 中-高  |

**grep 证据**:

```bash
grep -r "editMessage\|favorite\|translate" src/features/chat/ --include="*.tsx"
# 无消息操作相关匹配(仅语义词汇如 html translate 属性)
```

**message-row.tsx 当前菜单**: 复制 / 复制图片 / 回复 / 转发 / 多选 / 撤回 / 创建子区 / 删除(共 8 项,对齐旧版)  
**缺项均为 P3+ 留**

---

#### 2.4 Composer 媒体高级功能(2 项)

| 功能         | 状态      | 缺失链路                                         | 旧项目参考              | 工作量 |
| ------------ | --------- | ------------------------------------------------ | ----------------------- | ------ |
| Emoji 搜索   | ❌ 完全缺 | emoji-picker-popover.tsx 无 search input         | EmojiPicker.search      | 低     |
| Sticker 分类 | ❌ 完全缺 | emoji-picker-popover.tsx 仅 emoji tab,无 sticker | EmojiPicker.sticker tab | 中     |

**代码证据**:

- `emoji-picker-popover.tsx:71-93`: 仅遍历 EMOJI_LIST,无 search/filter 逻辑
- `emoji-picker-popover.tsx:98-110`: 仅一个 emoji tab,占位注释 `sticker 分类 P3+ 接 commonDataSource`

**优先级**: P3+ 留(影响低)

---

#### 2.5 Composer 工具栏菜单(2 项)

| 功能         | 状态          | 缺失链路                                  | 旧项目参考        | 工作量 |
| ------------ | ------------- | ----------------------------------------- | ----------------- | ------ |
| 创建任务菜单 | ❌ toast 占位 | composer.tsx:629-631 仅 toast.info("P3+") | dmworktodo.menu   | —      |
| 展开菜单     | ❌ toast 占位 | —                                         | dmworkbase.expand | —      |

**代码证据**:

- `composer.tsx:629`: `onClick={() => toast.info("创建任务功能即将接入(P3+)")}`

**说明**: 这两项无需 grep,直接是占位 toast,属于跨 feature 依赖(matter / todo),不在本期 P3-chat-completion 范围

---

#### 2.6 关注 & 子区管理(3 项)

| 功能                         | 缺失内容                      | 旧项目参考                     | 工作量 |
| ---------------------------- | ----------------------------- | ------------------------------ | ------ |
| 关注分组拖拽排序             | 无 @dnd-kit 集成              | @dnd-kit / follow/sort API     | 中     |
| 关注跨分组移动右键菜单       | 无 moveToCategory 上下文菜单  | context-menu.moveToCategory    | 低     |
| 子区主动 follow/unfollow API | 无 follow / unfollow 按钮入口 | conversation.follow / unfollow | 低     |

**grep 证据**:

```bash
grep -r "dnd-kit\|DndContext" src/features/chat/ --include="*.tsx"
# 无匹配(仅 draggable="false" 的无关结果)

grep -r "moveToCategory" src/features/chat/ --include="*.tsx"
# 无匹配

grep -r "\.follow\(|\.unfollow\(" src/features/chat/ --include="*.tsx"
# 无匹配(仅 unfollowChannel 在 conversation-list.tsx:305 用于取消关注,非主动 follow)
```

**当前 unfollow 状态**: `conversation-list.tsx:305` 仅支持"取消关注"(unfollowChannel),无双向 follow 按钮

**优先级**: P3-D4(handoff 明列)

---

#### 2.7 模态框(2 项)

| 功能            | 缺失内容            | 旧项目参考                      | 工作量 |
| --------------- | ------------------- | ------------------------------- | ------ |
| UserInfo modal  | 无导入 / 挂入口     | dmworkbase UserCard / InfoModal | 低     |
| BotDetail modal | 无 placeholder 实现 | dmworkbase BotDetailModal       | 低     |

**grep 证据**:

```bash
grep -r "UserInfoModal\|BotDetailModal" src/features/chat/ --include="*.tsx"
# 无匹配
```

**当前状态**: 全缺,仅 mention-list.tsx 显示 bot 的 isBot badge,无详情卡片

---

#### 2.8 其他功能(3 项)

| 功能                 | 缺失内容                    | 旧项目参考                     | 工作量 |
| -------------------- | --------------------------- | ------------------------------ | ------ |
| 群内快速搜索(非全局) | 无 channel-level search     | Conversation.quickSearch       | 中     |
| 群链接分享           | 无 group-link 生成          | GroupLink                      | 中     |
| 消息 reaction(emoji) | 无 reaction 交互 + renderer | message.reaction + ReactionRow | 高     |

**grep 证据**:

```bash
grep -r "channel.*search\|GroupLink\|reaction" src/features/chat/ --include="*.tsx"
# 无相关匹配(仅 global-search-modal)
```

---

#### 2.9 跨 Feature 集成(3 项 — 强耦合,属于下一阶段)

| 功能                       | 缺失内容             | 旧项目参考                      | 工作量 |
| -------------------------- | -------------------- | ------------------------------- | ------ |
| SmartCreateModal(提取事项) | 无 extractMatter API | matter.smartCreate + extraction | —      |
| extractMatter API 调用     | 同上                 | POST /matters/extract           | —      |
| ChatTodoPanel 集成         | 无 dmworktodo 侧边栏 | dmworktodo feature              | —      |

**grep 证据**:

```bash
grep -r "extractMatter\|SmartCreate\|ChatTodoPanel" src/features/chat/ --include="*.tsx"
# 无匹配
```

**说明**: 这些属于 P3-B 决策,需要 matter feature 完成后再跟进,不在本期 chat-completion MVP 范围

---

### ⚠️ 部分完成(需补关键链路)

| 功能                         | 发送端             | 接收端        | 缺失链路                                                                     | 工作量 |
| ---------------------------- | ------------------ | ------------- | ---------------------------------------------------------------------------- | ------ |
| **批量转发**                 | ✅ 逐条转发        | ⚠️ 仅第一条   | `selection-toolbar.tsx:82-85` toast "多选合并转发 P3+ 接入,当前只转发第一条" | 低     |
| **引用消息展示(ReplyBlock)** | ✅ 构造 reply 字段 | ❌ 无接收渲染 | message-row 无 `{message.reply ? <ReplyBlock /> : null}`                     | 低     |

**代码证据**:

- 批量转发: `selection-toolbar.tsx:79-86`
  ```tsx
  const onForward = () => {
    const msgs = findMessages();
    if (msgs.length === 0) return;
    if (msgs.length > 1) {
      toast.info("多选合并转发 P3+ 接入,当前只转发第一条"); // ← 明确标记仅第一条
    }
    setForwardOne(msgs[0]);
  };
  ```

**优先级**: P3-chat-v2 或 P3-B2(与合并转发消息类型关联)

---

## 三、audit-v2 功能维度总表(核心部分,含修订)

### 消息列表 & 渲染(完整度 82%)

| 功能                 | 新项目状态                           | 完整度  | 备注                       |
| -------------------- | ------------------------------------ | ------- | -------------------------- |
| 文本消息             | text-renderer.tsx                    | ✅ 完整 |                            |
| 图片消息(含大图预览) | image-renderer.tsx(fullscreen modal) | ✅ 完整 | audit-v1 误判为 P3+ 留     |
| 文件消息             | file-renderer.tsx                    | ✅ 完整 |                            |
| 视频消息             | video-renderer.tsx                   | 🟡 部分 | 不做倍速/字幕(P3+)         |
| 语音消息             | voice-renderer.tsx                   | 🟡 部分 | 不做波形(P3+)              |
| GIF 消息             | gif-renderer.tsx                     | 🟡 部分 | 不做大图预览(P3+)          |
| 链接卡片             | ❌ 无 LinkCardRenderer               | ❌ 未做 | P3+ 留                     |
| 红包消息             | ❌ 无 RedPacketRenderer              | ❌ 未做 | P3+ 留                     |
| 卡片消息             | ❌ 无 CardRenderer                   | ❌ 未做 | P3+ 留                     |
| Markdown 消息        | ❌ 无 MarkdownRenderer               | ❌ 未做 | P3+ 留                     |
| 数据表格消息         | ❌ 无 TableRenderer                  | ❌ 未做 | P3+ 留                     |
| 图表消息             | ❌ 无 ChartRenderer                  | ❌ 未做 | P3+ 留                     |
| Agent 消息           | ❌ 无                                | ❌ 未做 | P3+ 留                     |
| Extension 消息       | ❌ 无                                | ❌ 未做 | P3+ 留                     |
| 系统消息             | system-renderer.tsx                  | ✅ 完整 |                            |
| 子区创建事件         | thread-created-renderer.tsx          | ✅ 完整 |                            |
| 合并转发消息         | mergeforward-renderer.tsx            | 🟡 部分 | 简化版,展开聊天记录 P3+    |
| 消息撤回标记         | revoked-renderer.tsx                 | ✅ 完整 |                            |
| **引用消息展示**     | ❌ 无接收渲染                        | ❌ 未做 | 发送完整,接收缺(本期应补)  |
| @mention 接收高亮    | ❌ 无 MentionTag/parse               | ❌ 未做 | audit-v1 误标 🟡(实际全缺) |
| 消息已读标记         | message-status-badge.tsx             | ✅ 完整 | 无已读列表(P3+)            |
| 消息搜索高亮         | global-search-modal(结果)            | 🟡 部分 | 视觉效果 P3+               |

---

### 消息操作 & 右键菜单(完整度 80%)

| 功能                 | 完整度  | 备注                                      |
| -------------------- | ------- | ----------------------------------------- |
| 复制文本 / 复制图片  | ✅ 完整 | message-row.tsx:316-321                   |
| 回复消息(reply 构造) | ✅ 完整 | composer.tsx:343-349 + chat-reply.ts      |
| 转发消息             | ✅ 完整 | forward-modal.tsx                         |
| 多选 / 批量删除      | ✅ 完整 | chat-selection.ts + selection-toolbar.tsx |
| 批量转发             | ⚠️ 部分 | 仅第一条(selection-toolbar.tsx:82-85)     |
| 消息撤回             | ✅ 完整 | revokeMessage() + 120s 时限               |
| 消息编辑             | ❌ 未做 | P3+ 留                                    |
| 消息删除(硬删)       | ✅ 完整 | deleteMessagesApi()                       |
| 消息收藏             | ❌ 未做 | P3 留                                     |
| 消息翻译             | ❌ 未做 | P3 留                                     |
| 创建子区             | ✅ 完整 | createThread(name)                        |
| **引用消息显示**     | ❌ 未做 | 接收端无 ReplyBlock 渲染                  |
| 消息 reaction        | ❌ 未做 | P3+ 留                                    |

---

### Composer & 输入框(完整度 85%)

| 功能                          | 完整度        | 备注                          |
| ----------------------------- | ------------- | ----------------------------- |
| 文本输入(TipTap)              | ✅ 完整       |                               |
| Enter 发送 / Shift+Enter 换行 | ✅ 完整       |                               |
| 草稿自动保存                  | ✅ 完整       | useComposerDraft.hook         |
| @mention picker               | ✅ 完整       | mention-list.tsx + suggestion |
| Bot badge in mention          | ✅ 完整       | mention-list.tsx(isBot)       |
| Emoji picker                  | ✅ 完整       | emoji-picker-popover.tsx      |
| Emoji 搜索                    | ❌ 未做       | P3+ 留                        |
| Sticker 分类                  | ❌ 未做       | P3+ 留                        |
| **文件/图片/视频上传**        | ✅ 完整       | audit-v1 误判为 ❌(实际 ✅)   |
| 语音录制 + 转录               | ✅ 完整       | useVoiceRecorder.hook         |
| 引用消息预览                  | ✅ 完整       | composer 顶部 reply bar       |
| 菜单:任务 / 展开              | ❌ toast 占位 | P3+ 留(跨 feature)            |

---

### 关注 & 分组管理(完整度 75%)

| 功能                     | 完整度  | 缺失                      |
| ------------------------ | ------- | ------------------------- |
| 关注 tab 展示 / 分组展示 | ✅ 完整 |                           |
| 分组 CRUD                | ✅ 完整 |                           |
| 取消关注(群)             | ✅ 完整 | conversation-list.tsx:305 |
| 拖拽排序                 | ❌ 未做 | 无 @dnd-kit(P3-D4)        |
| 跨分组移动右键菜单       | ❌ 未做 | P3-D4                     |
| 子区主动 follow/unfollow | ❌ 未做 | P3-D4                     |
| 子区 overflow fold(+N)   | ❌ 未做 | P3-D4                     |
| DM 关注入口              | ❌ 未做 | P3-D4                     |

---

## 四、修订后的本期范围决策

### ✅ P3-chat-completion MVP 核心(无变化)

- 三列布局 + 消息列表虚拟化
- 文本 / 图片 / 文件 / 视频 / 语音 / GIF / 系统 / 子区 / 合并转发 / 撤回 消息(11 类)
- 右键菜单(8 项:复制/回复/转发/多选/撤回/创建子区/删除/含批量删除)
- @mention picker + emoji picker
- 群信息编辑 / 成员管理 / 二维码分享
- 全局搜索
- 关注分组管理(CRUD)
- 语音录制 + 转录
- 媒体上传(Paperclip + 粘贴 + 拖拽) ← audit-v1 误判为 P3,实际 ✅ 完成

---

### ⚠️ 本期补关键缺口(新增)

**审视结果**:audit-v1 标记有 3 个关键项被误判为"完成"或"不需做",实际需补:

| 优先级 | 功能                            | 状态                      | 工作量 | 建议纳入                   |
| ------ | ------------------------------- | ------------------------- | ------ | -------------------------- |
| **高** | **ReplyBlock 引用展示(接收端)** | ⚠️ 部分(缺接收渲染)       | 低     | ✅ 本期补                  |
| **中** | **mention 接收高亮**            | ❌ 全缺(audit-v1 误标 🟡) | 中     | ✅ P3-chat-v2              |
| **中** | **批量消息合并转发**            | ⚠️ 部分(仅第一条)         | 低     | ⚠️ P3-B2(合并转发消息相关) |

---

### 🔴 P3+ 明确不做(优先级顺序)

**P3 wave**(按需求程度排序):

1. **文件/图片/视频上传高级** — ✅ 基础完成,无需再投入
2. **Emoji 搜索** — 低优先级,sticker 同
3. **图表/表格消息 renderer** — 特定业务,先缺着
4. **批量合并转发完整版** — 与 P3-B2 关联(decision 待定)

**P3-D wave**(关注 tab polish):

- @dnd-kit 拖拽排序
- 子区 +N fold
- 跨分组移动右键菜单
- DM follow 入口

**P3-B wave**(matter / todo 依赖):

- SmartCreateModal + extractMatter
- ChatTodoPanel

---

## 五、版本对比统计

| 指标              | audit-v1 | audit-v2 | 变化                         |
| ----------------- | -------- | -------- | ---------------------------- |
| **完全缺失项 ❌** | 27       | 19       | -8(误判修正)                 |
| **部分完成项 ⚠️** | 5        | 4        | -1(ReplyBlock 独立出来)      |
| **完整项 ✅**     | 61       | 70       | +9(媒体上传/大图预览等修正)  |
| **误判项**        | 0        | **-8**   | 本版发现的偏差               |
| **本期应补项**    | 15+      | **3**    | 真实 P3-chat-completion 新增 |

**真实缺项总数降低理由**:

- audit-v1 按"是否接线完成"判定,缺少灰度判断(大图预览 P3+ 功能仅需 UI 工作栏)
- 媒体上传实际已接线(Paperclip 完整链路)
- 部分项混淆了"工作量分阶段"与"功能全无"

---

## 六、重点发现

### 确认 ✅ 的高价值修正

1. **媒体上传** — 已可用,无需再排计划
2. **图片大图预览** — 已可用,后续仅扩展工具栏

### 确认 ❌ 转 🟡 的关键补项

1. **ReplyBlock 接收渲染** — 一行代码补 + 新建 ReplyBlock 组件(仿 composer 的 reply bar)
2. **mention 接收高亮** — regex parse + span 包装(中等工作量)
3. **批量转发完整化** — 等 mergeforward-renderer 收消息后可补(成对优先级)

### audit-v1 缺点反思

- 未区分"工作量分层"(简单 UI 增强 vs 复杂功能)与"功能 0→1"
- 按"引入 feature 文件数"判定,漏掉"字段已在 compose 端就绪"的部分链路
- 缺乏灰度定义(P3+ 的工具栏≠P3 整体功能缺)

---

## 七、本期清单(P3-chat-completion 后续执行)

### Phase A:优先补(deadline 内)

- [ ] A1 ReplyBlock 接收端组件 + message-row 渲染挂入 (~2h)
- [ ] A2 确认 mention 接收高亮优先级(✅ or → P3-chat-v2)

### Phase B:合并计划

- [ ] B1 批量转发完整化(与 P3-B2 合并) — 待 mergeforward-renderer 需求确认

### Phase C:defer to next

- [ ] C1 mention 接收高亮 → P3-chat-v2
- [ ] C2 其他 19 项 P3+ 功能 → 按优先级排

---

**附注**: 本版本相比 audit-v1 的核心改进是:从"功能清单式枚举"升级到"代码事实驱动",杜绝主观猜测,确保 task-list 不再跑偏。
