# P3-chat-completion API 映射

> chat 模块本期补缺的所有 endpoint。每个 phase 列对应 API + 后端待对齐项。
> 现有 chat API 已稳定(messages / conversations / categories / sidebar / im-latency),本表只列**新增 / 待接入**。

## baseURL

- IM 主接口 `/v1/` — 复用 `features/base/api/client.ts`
- 跨 feature 复用 base/endpoints/group.api / user.api / friend.api 等

## Phase A — 核心增强

### A1 媒体上传

| Endpoint           | HTTP            | 用途                              | 备注                            |
| ------------------ | --------------- | --------------------------------- | ------------------------------- |
| `/v1/upload/file`  | POST(multipart) | 文件上传                          | 返回 `{ url, file_name, size }` |
| `/v1/upload/image` | POST(multipart) | 图片上传(可能复用 `/upload/file`) | 返回含 width/height             |
| `/v1/upload/video` | POST(multipart) | 视频上传(可能复用)                | 返回 duration/thumbnail         |

实现位置:`features/chat/api/upload.api.ts`(新建)

**待对齐**:看后端是统一 `/upload` 还是分类型;multipart field 名(`file` / `media`);上传后是否直接发消息或者两步走。

### A2 ReplyBlock

无新 endpoint — `reply` 字段已在 messages 响应里(参 wukongimjssdk Message.reply)。需要做的是前端渲染。

### A3 mention 接收端高亮

无新 endpoint — `mention` 字段已在 messages 响应里(`mention_all` / `mention_uids`)。需要前端 parse 文本 + 高亮 @uid。

### A4 合并转发完善

| Endpoint                     | HTTP | 用途         |
| ---------------------------- | ---- | ------------ |
| `/v1/messages/forward-merge` | POST | 合并消息转发 |

Body 示例:

```json
{
  "from_message_ids": ["id1", "id2"],
  "to_channel": { "channel_id": "...", "channel_type": 2 },
  "title": "Alice 的聊天记录"
}
```

实现位置:`features/chat/api/messages.api.ts`(已存在,加新函数)

## Phase B — 5 类高级 renderer

**无新 endpoint** — 5 类都是消息渲染层,后端通过 `content.type` 区分,前端在 `message-renderers/dispatch.tsx` 加 case。

需要补的:

- `contentType` 枚举对齐后端实际值(grep 旧项目 `MessageContentTypes` 枚举)
- `message-renderers/link-card-renderer.tsx`(新建)
- `message-renderers/red-packet-renderer.tsx`
- `message-renderers/card-renderer.tsx`
- `message-renderers/markdown-renderer.tsx`
- `message-renderers/table-renderer.tsx`
- `message-renderers/chart-renderer.tsx`

**抢红包**:`/v1/red-packet/open` POST(若做完整闭环;若纯展示则只渲染)

## Phase C — 关注 tab polish

### C1 子区 follow/unfollow + DM 关注

| Endpoint                         | HTTP   | 用途          |
| -------------------------------- | ------ | ------------- |
| `/v1/follow/dm`                  | POST   | 关注 DM(单聊) |
| `/v1/follow/dm/:uid`             | DELETE | 取关 DM       |
| `/v1/follow/channel/:channel_id` | POST   | 关注子区 / 群 |
| `/v1/follow/channel/:channel_id` | DELETE | 取关          |

实现位置:`features/base/api/endpoints/follow.api.ts`(已有,补 DM / 子区路径)

### C2 子区 overflow fold

无新 endpoint — 前端 UI 切片。

### C3 跨分组移动右键菜单

| Endpoint          | HTTP | 用途                    |
| ----------------- | ---- | ----------------------- |
| `/v1/follow/move` | POST | 把会话移到指定 category |

Body: `{ conversation_id, target_category_id }`

实现位置:`features/chat/api/categories.api.ts`(若有)或新建。

### C4 拖拽排序

| Endpoint          | HTTP | 用途                  |
| ----------------- | ---- | --------------------- |
| `/v1/follow/sort` | POST | 提交完整 sorted order |

Body: `{ category_id, conversation_ids: [...] }`(全量 reorder)

**依赖**:`pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`

## Phase D — 体验增强

### D1 图片 / 视频大图预览

无 endpoint — 前端 modal,复用 messages response 的 url。

依赖:可能装 `react-image-gallery` 或自写。

### D2 语音波形

无新 endpoint — 前端从音频文件 decodeAudioData → 画波形。

依赖:`wavesurfer.js` 或自写 canvas(看包大小取舍)。

### D3 Emoji 搜索 + sticker

无新 endpoint(若 sticker 走静态包)— 或 `/v1/stickers` 拉 sticker 列表(看产品)。

### D4 群链接分享

| Endpoint                           | HTTP | 用途       |
| ---------------------------------- | ---- | ---------- |
| `/v1/groups/:group_no/invite-link` | GET  | 拿邀请链接 |
| `/v1/groups/:group_no/invite-link` | POST | 重新生成   |

实现位置:`features/base/api/endpoints/group.api.ts`(已存在 qrcode 类似,加 link 类型)

### D5 群内搜索

| Endpoint              | HTTP | 用途     |
| --------------------- | ---- | -------- |
| `/v1/messages/search` | GET  | 消息搜索 |

Query: `{ channel_id, channel_type, keyword, limit, offset }`

实现位置:`features/chat/api/messages.api.ts`

### D6 消息收藏 / 星标

| Endpoint            | HTTP   | 用途         |
| ------------------- | ------ | ------------ |
| `/v1/favorites`     | GET    | 我的收藏列表 |
| `/v1/favorites`     | POST   | 添加         |
| `/v1/favorites/:id` | DELETE | 取消         |

Body: `{ message_id, source_channel_id, source_channel_type }`

实现位置:`features/chat/api/favorites.api.ts`(新建)

### D7 消息编辑

| Endpoint                | HTTP | 用途         |
| ----------------------- | ---- | ------------ |
| `/v1/messages/:id/edit` | PUT  | 编辑消息内容 |

Body: `{ content: {...} }`

**待对齐**:后端是否支持 / 时限(几分钟内)

### D8 消息 reaction

| Endpoint                            | HTTP   | 用途                                                  |
| ----------------------------------- | ------ | ----------------------------------------------------- |
| `/v1/messages/:id/reactions`        | POST   | 添加 reaction                                         |
| `/v1/messages/:id/reactions/:emoji` | DELETE | 取消                                                  |
| `/v1/messages/:id/reactions`        | GET    | 拉某条消息的所有 reactions(可能内嵌在 message 响应中) |

## Phase E — 收尾

无新 endpoint。

## 复用 base/endpoints(无需新增,只调用)

| 现有 endpoint                                               | 谁用                              |
| ----------------------------------------------------------- | --------------------------------- |
| `space.api.ts` getSpaceMembers                              | mention picker, add-members modal |
| `robot.api.ts` getSpaceBots                                 | mention bot suggestion            |
| `group.api.ts` getMyGroups / createGroup / updateGroup / 等 | 全套群管理                        |
| `user.api.ts`                                               | 用户头像 / 名字                   |
| `channel.api.ts`                                            | 频道 info                         |

## 类型同步

- `features/chat/types/`(若不存在则按需建):新增 reply / mergeforward-real / red-packet / favorite / reaction / sticker / link-card 等类型
- contentType 枚举:`features/chat/lib/content-types.ts`(对齐后端 `MessageContentTypes`)

## 错误处理

沿用 `errorToast` 拦截器。**新增**:上传失败要细化错误(超大 / 类型不允许 / 网络中断 / 服务器拒绝),给用户可读 toast。
