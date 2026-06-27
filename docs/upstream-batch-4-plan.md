# 上游搬运 Batch 4 — 2026-06-23 后暂缓池

> 生成日期: 2026-06-26；补录日期: 2026-06-27
> 文档分支: `codex/update-batch-4-records`，基于新仓 `origin/main`
> 新仓基线: `frontend/octo-web-2` `origin/main` = `f53a858`
> 老仓路径: `/Users/houmenghao/project/octo/octo-web`
> 老仓暂缓起点: `3f3059ee`
> 老仓远端 HEAD: `6055b724`
> 状态: 可执行，老项目已确认正式上线

## 目标

本文件记录 2026-06-23 之后已经合入老仓、现已确认上线的 upstream 变更。

- 暂缓范围:`3f3059ee..6055b724`，13 个 commit，72 files changed / +9200 / -440。
- 解锁记录:2026-06-27 项目负责人确认老项目版本已正式上线；老仓 `main` 已拉到 `6055b724` 且无新增提交。
- 处理原则:按 4.1 → 4.4 分组拆 MR；后端依赖项仍需在新仓环境中逐项验收。

## 暂缓提交清单

| SHA        | 时间(+0800)      | 标题                                                   | 后续方向                |
| ---------- | ---------------- | ------------------------------------------------------ | ----------------------- |
| `c2ea912b` | 2026-06-23 15:17 | channel search locate 和 keyword limit polish          | ChannelSearch follow-up |
| `a85207a6` | 2026-06-23 17:01 | render forwarded channel search inner messages         | ChannelSearch follow-up |
| `7774db69` | 2026-06-24 10:31 | channel search sender filters 独立计数                 | ChannelSearch follow-up |
| `c16ffb9b` | 2026-06-24 11:24 | channel search snippet emojis                          | ChannelSearch follow-up |
| `6c379a18` | 2026-06-24 14:08 | show raw HTML in messages                              | Message renderer 待核对 |
| `a9b0151a` | 2026-06-24 16:53 | preview channel search media results                   | ChannelSearch follow-up |
| `5e945f52` | 2026-06-24 18:49 | compact conversation list 渲染 online badge            | Conversation polish     |
| `690c1329` | 2026-06-25 11:36 | smart summary 多人协作 UI                              | Summary follow-up       |
| `4a396d00` | 2026-06-25 19:05 | channel webhook 管理 UI 重做:mention config / examples | Webhook follow-up       |
| `553c1710` | 2026-06-25 20:06 | webhook push URL 显示短 `/v1/webhooks` alias           | Webhook follow-up       |
| `d1b4a8f1` | 2026-06-26 11:10 | thread-scoped incoming webhooks frontend               | Webhook follow-up       |
| `88e570cc` | 2026-06-26 17:15 | render rich channel search results                     | ChannelSearch follow-up |
| `6055b724` | 2026-06-27 10:41 | localized adapter examples in webhook URL modal        | Webhook follow-up       |

## 分组建议

### Batch 4.1 — ChannelSearch Follow-up

> Batch 3.1 的前端实现已顺手兼容部分能力(定位、合并转发内层展示、媒体预览等),但这些 SHA 仍晚于上线边界。本节保持暂缓状态,待老项目上线后逐项验收并补齐差异。
> 当前测试环境 `/v1/common/appconfig` 未下发 `messages_search_on`,搜索接口也返回 `Not Found`;Batch 3.1 已按老仓远程开关默认隐藏入口。解锁 Batch 4.1 前需先确认后端接口与开关已上线。

- [x] `c2ea912b` locate 和 keyword limit polish
  - 搜索定位应复用本仓 `chatLocateMessageActions` / `locate-reply-message` 体系。
  - keyword 超长要有前端限制和 i18n 文案。
  - 已实现:定位复用本仓 `chatLocateMessageActions.request(..., { strategy: "window" })`;keyword 64 rune 限制、toast、到顶提示、IME composing 保护已补齐。
  - 验证:`vp test run src/features/base/api/endpoints/search.api.test.ts`、`npx tsc -b`、touched-file lint。

- [x] `a85207a6` forwarded inner message render
  - 搜索结果中合并转发消息需要展示内部命中项。
  - 不要引入老仓 MessageCell 架构；复用本仓 message renderers / digest helpers。
  - 已实现:本仓 `ChannelSearchForwardInfo.innerMessages` 已映射并在搜索卡片内展示 sender/text 行。
  - 验证:`vp test run src/features/base/api/endpoints/search.api.test.ts` 覆盖 forward inner message mapping。

- [x] `7774db69` sender filter 独立计数
  - sender filter 计数不能和 message/media/file result count 混淆。
  - 判定:新仓筛选按钮只显示“有筛选”的点状状态，不显示数字 badge；不存在 sender 数量被折算成 1 或与结果数量混淆的问题。

- [x] `c16ffb9b` snippet emoji 渲染
  - snippet 内容里 emoji / mention / highlight 必须走安全渲染，不直接 dangerouslySetInnerHTML。
  - 已实现:搜索结果 snippet 改为 React token 渲染，支持后端 `<mark>` 切开 `[有品位]` 等自定义 emoji token 时仍整图展示。
  - 验证:`vp test run src/features/chat/lib/channel-search-snippet.test.ts`、`npx tsc -b`、touched-file lint。

- [x] `a9b0151a` media result preview
  - 图片 / 视频结果应接入本仓 file-preview side panel 或 lightbox。
  - 视频 renderer 如果缺失，需要先补本仓 file-preview registry。
  - 已实现:搜索图片结果点击进入本仓会话图片查看器；视频结果继续进入 file-preview side panel；补 `video` renderer 和 registry 扩展名注册。
  - 验证:`vp test run src/features/chat/file-preview/registry.test.ts`、`npx tsc -b`、touched-file lint。

- [x] `88e570cc` rich channel search results
  - `_search_all` 的 rich_text / image / video 命中需要映射到本仓搜索结果模型。
  - rich_text 渲染应复用本仓 `richtext-content` / message renderers，不引入老仓 MixedContent 结构。
  - 仍保持 all/message 空关键词 conservative guard，直到后端明确支持 browse mode。
  - 已实现:补 `_search_all` rich_text / message_kind image / video 映射，搜索面板展示富文本块、图片/视频媒体结果。
  - 已实现:入口对齐老仓,从 chat header 独立搜索图标调整为“聊天信息 / 群信息 / 子区信息”里的“查找聊天内容”行,点击后关闭设置抽屉并打开右侧搜索面板。
  - 已实现:图片/视频 tab 对齐老仓按月份分组平铺缩略图,提升媒体结果浏览密度;all tab 仍保留混合结果列表。
  - 已实现:文件 tab 对齐老仓紧凑行式结果,展示文件名、发送人、大小、日期,hover 露出定位/下载操作;all tab 仍保留混合结果卡片。
  - 已实现:图片缩略图点击进入会话同款全屏图片查看器；图片无原图 URL 时允许用 `thumbUrl` 兜底预览；视频缩略图点击进入 file-preview。
  - 已实现:从搜索结果打开文件/媒体预览时保留搜索面板内部状态,关闭预览后回到原 tab / keyword / filter。
  - 验证:用户已在 5174 登录环境验证搜索基础路径；`vp test run src/features/base/api/endpoints/search.api.test.ts`、`npx tsc -b`、touched-file lint。

### Batch 4.2 — Summary 多人协作

- [x] `690c1329` multi-person collaboration UI
  - 新仓已有 participants / CitationText / SummaryCard 多人状态基础，需逐项核对差异。
  - 重点核对:详情页多人确认流、参与者状态、引用 badge、ScheduleList one-to-many 确认、SummaryCreatePage 参与者选择入口。
  - 已实现:Summary API 补 `leaveSummary` / `removeMember`;列表卡片按 `creator_id` 分流创建者删除、参与者退出;详情页补参与者退出、creator 移除成员、成员状态面板、团队汇总内容展示。
  - 已实现:Summary 主创建工作台补“选择参与者”操作,与“选择聊天 / 定时更新”并列;选择后创建/定时请求透传 `participants`。
  - 已实现:`CitationText` 支持团队引用 `[Pn]`,团队汇总隐私模式下只解析人员引用、普通 `[n]` 保持文本;个人报告支持展开/收起。
  - 验证:`vp test run src/features/summary/components/citation-text.test.tsx`、`npx tsc -b`、touched-file lint、浏览器 5174 reload 无 console error。

### Batch 4.3 — Webhook Follow-up

- [x] `4a396d00` channel webhook 管理 UI 重做
  - 新仓已有 incoming webhook panel；对照老仓新增的 mention config、adapter examples、modal spacing、权限差异。
  - 核对 `submitBotAdmins` / bot admin 批量逻辑是否已和 webhook mention config 合流。
  - URL modal 示例需确认 curl / fetch / Python / GitHub 等是否完整。
  - 已实现:Webhook 新建/编辑表单补自动 @ 成员、@所有AI、@所有人配置;请求体按 create/edit 差异只发必要字段;提及成员前端数量/长度校验。
  - 说明:`submitBotAdmins` 仍保留在群管理 bot 管理路径;本次 Webhook mention config 不复用 bot admin 批量逻辑。
  - 验证:`vp test run src/features/chat/lib/incoming-webhook.test.ts src/features/base/api/endpoints/group.api.test.ts`、`npx tsc -b`、touched-file lint、浏览器 5174 reload 无 console error。

- [x] `553c1710` short `/v1/webhooks` alias
  - 新仓 `buildIncomingWebhookUrl` 需要核对是否生成 canonical URL 和 short alias。
  - UI 需要明确展示短 alias，避免只显示绝对长 URL。
  - 已实现:`toShortWebhookAlias` 将 `/v1/incoming-webhooks/...` 展示改写为短 `/v1/webhooks/...`;native/github/wecom/gitlab/feishu/multica 统一走该逻辑。
  - 验证:`src/features/chat/lib/incoming-webhook.test.ts` 覆盖短 alias 和 URL rows。

- [x] `d1b4a8f1` thread-scoped incoming webhooks
  - 依赖后端 `octo-server #454` 的子区 webhook 管理端点:`groups/{group}/threads/{short}/incoming-webhooks`。
  - 新仓需确认 `incoming-webhook-panel` 能以父群 channel + thread short id 打开子区作用域。
  - 权限口径应复用父群 owner / manager 判断，避免对子区自身发明角色矩阵。
  - 已实现:群 Webhook API 支持可选 `threadShortId`;子区设置页活跃态展示“消息推送”入口,面板传父群 channel + thread short id,query key 按子区隔离。
  - 验证:`src/features/base/api/endpoints/group.api.test.ts` 覆盖 group/thread endpoint path。

- [x] `6055b724` localized adapter examples
  - 依赖后端 `octo-server #475` 在 create/regenerate 响应返回 `adapter_examples`。
  - UI 应优先渲染后端本地化 examples，旧后端无字段时回退到现有 urls-based 示例。
  - URL 展示仍需复用短 `/v1/webhooks` alias 改写。
  - 已实现:URL 弹窗优先渲染服务端 `adapter_examples`,支持接入步骤折叠、header token 提示与复制;旧后端 fallback 到 urls-based GitHub/GitLab/飞书/Multica/企微说明。
  - 验证:`src/features/chat/lib/incoming-webhook.test.ts` 覆盖 adapter examples 归一化和短 alias。

### Batch 4.4 — Chat 小修

- [x] `6c379a18` raw HTML in messages
  - 核对本仓 markdown/text renderer 是否会错误吞 raw HTML。
  - 注意安全边界:展示 raw HTML 不等于执行 HTML。
  - 已实现:通用 `Markdown` 在 remark 阶段将 raw HTML node 转为 text node,源码可见但不执行。
  - 验证:`vp test run src/components/ui/markdown.test.tsx`、`npx tsc -b`、touched-file lint。

- [x] `5e945f52` compact conversation list online badge
  - 核对关注 / 分组 tab 的 compact row 是否保留在线状态。
  - 已实现:抽出 `shouldShowConversationOnline`,最近列表与关注 compact row 共用同一在线/1h 内离线判定;compact row 渲染缩小版在线点。
  - 验证:`vp test run src/features/chat/lib/conversation-online.test.ts`、`npx tsc -b`、touched-file lint。

## 执行处理

1. 按 4.1 → 4.4 顺序拆实现 MR。
2. 实现 MR 不应回改 Batch 3 的 cutoff，保持按周边界清晰。
3. 每个实现 MR 必须列出覆盖的 upstream SHA 和验证结果。
