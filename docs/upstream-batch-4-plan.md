# 上游搬运 Batch 4 — 2026-06-23 后暂缓池

> 生成日期: 2026-06-26
> 文档分支: `codex/upstream-batch-3-records`，基于新仓 `origin/main`
> 新仓基线: `frontend/octo-web-2` `origin/main` = `d4f8b3c`
> 老仓路径: `/Users/houmenghao/project/octo/octo-web`
> 老仓暂缓起点: `3f3059ee`
> 老仓当前 HEAD: `553c1710`
> 状态: 暂缓，待本周老项目正式上线后再进入迁移评估

## 目标

本文件记录 2026-06-23 之后已经合入老仓、但本周尚未正式上线的 upstream 变更。

- 暂缓范围:`3f3059ee..553c1710`，10 个 commit，65 files changed / +7771 / -382。
- 暂缓原因:这些改动本周末可能才上线；上线前不纳入 Batch 3 的可执行范围。
- 解锁条件:项目负责人确认对应老项目版本已正式上线，或明确允许提前迁移。

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

## 分组建议

### Batch 4.1 — ChannelSearch Follow-up

> Batch 3.1 的前端实现已顺手兼容部分能力(定位、合并转发内层展示、媒体预览等),但这些 SHA 仍晚于上线边界。本节保持暂缓状态,待老项目上线后逐项验收并补齐差异。
> 当前测试环境 `/v1/common/appconfig` 未下发 `messages_search_on`,搜索接口也返回 `Not Found`;Batch 3.1 已按老仓远程开关默认隐藏入口。解锁 Batch 4.1 前需先确认后端接口与开关已上线。

- [ ] `c2ea912b` locate 和 keyword limit polish
  - 搜索定位应复用本仓 `chatLocateMessageActions` / `locate-reply-message` 体系。
  - keyword 超长要有前端限制和 i18n 文案。

- [ ] `a85207a6` forwarded inner message render
  - 搜索结果中合并转发消息需要展示内部命中项。
  - 不要引入老仓 MessageCell 架构；复用本仓 message renderers / digest helpers。

- [ ] `7774db69` sender filter 独立计数
  - sender filter 计数不能和 message/media/file result count 混淆。

- [ ] `c16ffb9b` snippet emoji 渲染
  - snippet 内容里 emoji / mention / highlight 必须走安全渲染，不直接 dangerouslySetInnerHTML。

- [ ] `a9b0151a` media result preview
  - 图片 / 视频结果应接入本仓 file-preview side panel 或 lightbox。
  - 视频 renderer 如果缺失，需要先补本仓 file-preview registry。

### Batch 4.2 — Summary 多人协作

- [ ] `690c1329` multi-person collaboration UI
  - 新仓已有 participants / CitationText / SummaryCard 多人状态基础，需逐项核对差异。
  - 重点核对:详情页多人确认流、参与者状态、引用 badge、ScheduleList one-to-many 确认、SummaryCreatePage mode 切换。

### Batch 4.3 — Webhook Follow-up

- [ ] `4a396d00` channel webhook 管理 UI 重做
  - 新仓已有 incoming webhook panel；对照老仓新增的 mention config、adapter examples、modal spacing、权限差异。
  - 核对 `submitBotAdmins` / bot admin 批量逻辑是否已和 webhook mention config 合流。
  - URL modal 示例需确认 curl / fetch / Python / GitHub 等是否完整。

- [ ] `553c1710` short `/v1/webhooks` alias
  - 新仓 `buildIncomingWebhookUrl` 需要核对是否生成 canonical URL 和 short alias。
  - UI 需要明确展示短 alias，避免只显示绝对长 URL。

### Batch 4.4 — Chat 小修

- [ ] `6c379a18` raw HTML in messages
  - 核对本仓 markdown/text renderer 是否会错误吞 raw HTML。
  - 注意安全边界:展示 raw HTML 不等于执行 HTML。

- [ ] `5e945f52` compact conversation list online badge
  - 核对关注 / 分组 tab 的 compact row 是否保留在线状态。

## 解锁后处理

1. 确认老项目包含 `c2ea912b..553c1710` 的版本已经正式上线。
2. 将本文件状态从“暂缓”改为“可执行”。
3. 按 4.1 → 4.4 顺序拆实现 MR。
4. 实现 MR 不应回改 Batch 3 的 cutoff，保持按周边界清晰。
