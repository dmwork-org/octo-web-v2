# 旧项目 API 调用清单

> 来源:扫描 `octo-web/packages/dmwork*/src/` 全部 `WKApp.apiClient.{get,post,put,delete}(...)` 调用,2026-05-23 截。
>
> 总共 132 个调用点(尚有约 9 处多行/动态变量 url 未匹配)。
>
> **用途**:P3 业务驱动时按 feature 抽到 `src/features/<feat>/api/*.api.ts`,本文件是迁移检查表。
> **不要**在 P1 阶段把这里全部预抽 — 大量端点 P3 才会真有调用方。
>
> **来源映射(旧包 → 新 feature)**:
>
> - `dmworkbase` → 大多入 `features/base/api/endpoints/*` (拦截器内部、conversation/groups/channel 等基础设施);Chat 内 message 类端点入 `features/chat`
> - `dmworklogin` → `features/login`
> - `dmworkcontacts` → `features/contacts`
> - `dmworktodo` → `features/matter`(matter/todo 同义)
> - `dmworkappbot` → `features/appbot`
> - `dmworkdatasource` → 不是 sidebar 顶级菜单,属于 data layer,抽到 `features/base/api/endpoints/*`(按资源归类)
>
> **base URL 前缀**:本清单 path 是去 baseURL 后的相对路径;dev/prod 都走 `/v1` 前缀(已在 `features/base/stores/endpoint.ts` 默认)。

---

## `dmworkappbot`

### `app_bot/*`

| Method | Path                 | Callers                               |
| ------ | -------------------- | ------------------------------------- |
| POST   | `/app_bot/apply`     | `dmworkappbot/src/AppBotPage.tsx:136` |
| GET    | `/app_bot/available` | `dmworkappbot/src/AppBotPage.tsx:78`  |

## `dmworkbase`

### `common/*`

| Method | Path               | Callers                      |
| ------ | ------------------ | ---------------------------- |
| GET    | `common/appconfig` | `dmworkbase/src/App.tsx:220` |

### `conversation/*`

| Method | Path                       | Callers                                                     |
| ------ | -------------------------- | ----------------------------------------------------------- |
| PUT    | `conversation/clearUnread` | `dmworkbase/src/Components/ConversationList/index.tsx:1072` |

### `file/*`

| Method | Path                                                                                                                   | Callers                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| GET    | `file/download/url?path=${encodeURIComponent(remotePath)}&filename=${encodeURIComponent(filename)}`                    | `dmworkbase/src/Utils/download.ts:10` |
| GET    | `file/download/url?path=${encodeURIComponent(remotePath)}&filename=${encodeURIComponent(filename)}&disposition=inline` | `dmworkbase/src/Utils/download.ts:26` |

### `friend/*`

| Method | Path           | Callers                                                  |
| ------ | -------------- | -------------------------------------------------------- |
| POST   | `friend/apply` | `dmworkbase/src/Components/BotDetailModal/index.tsx:317` |

### `groups/*`

| Method | Path                                                   | Callers                                                   |
| ------ | ------------------------------------------------------ | --------------------------------------------------------- |
| GET    | `groups/${message.channel.channelID}/member/h5confirm` | `dmworkbase/src/Messages/ApproveGroupMember/index.tsx:19` |

### `message/*`

| Method | Path                          | Callers                                             |
| ------ | ----------------------------- | --------------------------------------------------- |
| GET    | `message/prohibit_words/sync` | `dmworkbase/src/Service/ProhibitwordsService.ts:24` |

### `obo/*`

| Method | Path                                 | Callers                                                                                                                                                                  |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `obo/grants`                         | `dmworkbase/src/Components/ChannelSetting/vm.ts:256`<br>`dmworkbase/src/Components/PersonaSettings/vm.tsx:151`<br>`dmworkbase/src/Components/PersonaSettings/vm.tsx:515` |
| POST   | `obo/grants`                         | `dmworkbase/src/Components/PersonaSettings/vm.tsx:282`                                                                                                                   |
| GET    | `obo/grants/${active.id}/scopes`     | `dmworkbase/src/Components/ChannelSetting/vm.ts:272`                                                                                                                     |
| DELETE | `obo/grants/${id}`                   | `dmworkbase/src/Components/PersonaSettings/vm.tsx:299`                                                                                                                   |
| PUT    | `obo/grants/${id}`                   | `dmworkbase/src/Components/PersonaSettings/vm.tsx:323`                                                                                                                   |
| DELETE | `obo/grants/${this.grant.id}`        | `dmworkbase/src/Components/PersonaSettings/vm.tsx:452`                                                                                                                   |
| PUT    | `obo/grants/${this.grant.id}`        | `dmworkbase/src/Components/PersonaSettings/vm.tsx:408`<br>`dmworkbase/src/Components/PersonaSettings/vm.tsx:436`                                                         |
| GET    | `obo/grants/${this.grant.id}/scopes` | `dmworkbase/src/Components/PersonaSettings/vm.tsx:362`                                                                                                                   |
| POST   | `obo/scopes`                         | `dmworkbase/src/Components/ChannelSetting/vm.ts:200`<br>`dmworkbase/src/Components/ChannelSetting/vm.ts:215`<br>`dmworkbase/src/Components/PersonaSettings/vm.tsx:381`   |
| DELETE | `obo/scopes/${id}`                   | `dmworkbase/src/Components/PersonaSettings/vm.tsx:397`                                                                                                                   |
| DELETE | `obo/scopes/${this._oboScope.id}`    | `dmworkbase/src/Components/ChannelSetting/vm.ts:195`                                                                                                                     |

### `robot/*`

| Method | Path                       | Callers                                                  |
| ------ | -------------------------- | -------------------------------------------------------- |
| GET    | `/robot/my_bots`           | `dmworkbase/src/Pages/BotStore/index.tsx:57`             |
| GET    | `/robot/space_bots`        | `dmworkbase/src/Pages/BotStore/index.tsx:58`             |
| PUT    | `robot/${uid}/description` | `dmworkbase/src/Components/BotDetailModal/index.tsx:277` |

### `space/*`

| Method | Path                                                   | Callers                                       |
| ------ | ------------------------------------------------------ | --------------------------------------------- |
| DELETE | `space/${spaceId}`                                     | `dmworkbase/src/Service/SpaceService.tsx:249` |
| GET    | `space/${spaceId}`                                     | `dmworkbase/src/Service/SpaceService.tsx:210` |
| PUT    | `space/${spaceId}`                                     | `dmworkbase/src/Service/SpaceService.tsx:241` |
| POST   | `space/${spaceId}/invite`                              | `dmworkbase/src/Service/SpaceService.tsx:219` |
| POST   | `space/${spaceId}/leave`                               | `dmworkbase/src/Service/SpaceService.tsx:237` |
| DELETE | `space/${spaceId}/members`                             | `dmworkbase/src/Service/SpaceService.tsx:245` |
| PUT    | `space/${spaceId}/members/${uid}/role`                 | `dmworkbase/src/Service/SpaceService.tsx:253` |
| GET    | `space/${spaceId}/members?page=${page}&limit=${limit}` | `dmworkbase/src/Service/SpaceService.tsx:214` |
| POST   | `space/create`                                         | `dmworkbase/src/Service/SpaceService.tsx:206` |
| GET    | `space/invite/${inviteCode}`                           | `dmworkbase/src/Service/SpaceService.tsx:229` |
| POST   | `space/join`                                           | `dmworkbase/src/Service/SpaceService.tsx:233` |
| GET    | `space/my`                                             | `dmworkbase/src/Service/SpaceService.tsx:201` |

### `user/*`

| Method | Path                       | Callers                                       |
| ------ | -------------------------- | --------------------------------------------- |
| DELETE | `/user/reddot/friendApply` | `dmworkbase/src/App.tsx:1027`                 |
| GET    | `/user/reddot/friendApply` | `dmworkbase/src/App.tsx:972`                  |
| PUT    | `user/current`             | `dmworkbase/src/Components/MeInfo/vm.tsx:266` |

### `users/*`

| Method | Path                       | Callers                                                  |
| ------ | -------------------------- | -------------------------------------------------------- |
| GET    | `users/${item.channel_id}` | `dmworkbase/src/Pages/Chat/vm.ts:471`                    |
| GET    | `users/${requestedUid}`    | `dmworkbase/src/Components/BotDetailModal/index.tsx:139` |
| GET    | `users/${this.uid}`        | `dmworkbase/src/Components/UserInfo/vm.tsx:255`          |
| GET    | `users/${uid}`             | `dmworkbase/src/Components/MeInfo/vm.tsx:134`            |

## `dmworkcontacts`

### `friend/*`

| Method | Path            | Callers                                  |
| ------ | --------------- | ---------------------------------------- |
| GET    | `/friend/apply` | `dmworkcontacts/src/NewFriend/vm.tsx:57` |

### `group/*`

| Method | Path                            | Callers                                     |
| ------ | ------------------------------- | ------------------------------------------- |
| GET    | `/group/my?space_id=${spaceId}` | `dmworkcontacts/src/Contacts/index.tsx:235` |

### `organization/*`

| Method | Path                   | Callers                                                   |
| ------ | ---------------------- | --------------------------------------------------------- |
| GET    | `/organization/joined` | `dmworkcontacts/src/Organizational/GroupNew/index.tsx:88` |

### `robot/*`

| Method | Path                | Callers                                                                                    |
| ------ | ------------------- | ------------------------------------------------------------------------------------------ |
| GET    | `/robot/my_bots`    | `dmworkcontacts/src/Contacts/index.tsx:233`                                                |
| GET    | `/robot/space_bots` | `dmworkcontacts/src/Contacts/index.tsx:234`<br>`dmworkcontacts/src/Contacts/index.tsx:786` |

### `user/*`

| Method | Path                       | Callers                                  |
| ------ | -------------------------- | ---------------------------------------- |
| DELETE | `/user/reddot/friendApply` | `dmworkcontacts/src/NewFriend/vm.tsx:82` |

## `dmworkdatasource`

### `channels/*`

| Method | Path                                         | Callers                             |
| ------ | -------------------------------------------- | ----------------------------------- |
| GET    | `channels/${realUID}/${channel.channelType}` | `dmworkdatasource/src/module.ts:84` |

### `conversation/*`

| Method | Path                       | Callers                                   |
| ------ | -------------------------- | ----------------------------------------- |
| PUT    | `conversation/clearUnread` | `dmworkdatasource/src/conversation.ts:35` |
| POST   | `conversation/extra/sync`  | `dmworkdatasource/src/module.ts:229`      |

### `conversations/*`

| Method | Path                                                                                                  | Callers                                  |
| ------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| POST   | `conversations/${conversationExtra.channel.channelID}/${conversationExtra.channel.channelType}/extra` | `dmworkdatasource/src/datasource.ts:194` |

### `favorite/*`

| Method | Path                                                            | Callers                                  |
| ------ | --------------------------------------------------------------- | ---------------------------------------- |
| GET    | `favorite/my?page_index=1&page_size=${MAX_FAVORITES_PAGE_SIZE}` | `dmworkdatasource/src/datasource.ts:357` |

### `favorites/*`

| Method | Path              | Callers                                  |
| ------ | ----------------- | ---------------------------------------- |
| POST   | `favorites`       | `dmworkdatasource/src/datasource.ts:367` |
| DELETE | `favorites/${id}` | `dmworkdatasource/src/datasource.ts:376` |

### `friend/*`

| Method | Path            | Callers                                                                                                                          |
| ------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `friend/apply`  | `dmworkdatasource/src/datasource.ts:408`                                                                                         |
| PUT    | `friend/remark` | `dmworkdatasource/src/datasource.ts:353`                                                                                         |
| POST   | `friend/sure`   | `dmworkdatasource/src/datasource.ts:399`                                                                                         |
| GET    | `friend/sync`   | `dmworkdatasource/src/datasource.ts:483`<br>`dmworkdatasource/src/datasource.ts:542`<br>`dmworkdatasource/src/datasource.ts:554` |

### `friends/*`

| Method | Path             | Callers                                  |
| ------ | ---------------- | ---------------------------------------- |
| DELETE | `friends/${uid}` | `dmworkdatasource/src/datasource.ts:349` |

### `group/*`

| Method | Path           | Callers                                 |
| ------ | -------------- | --------------------------------------- |
| POST   | `group/create` | `dmworkdatasource/src/datasource.ts:38` |
| GET    | `group/my`     | `dmworkdatasource/src/datasource.ts:46` |

### `groups/*`

| Method | Path                                                                 | Callers                                  |
| ------ | -------------------------------------------------------------------- | ---------------------------------------- |
| PUT    | `groups/${channel.channelID}`                                        | `dmworkdatasource/src/datasource.ts:117` |
| POST   | `groups/${channel.channelID}/blacklist/add`                          | `dmworkdatasource/src/datasource.ts:153` |
| POST   | `groups/${channel.channelID}/blacklist/remove`                       | `dmworkdatasource/src/datasource.ts:158` |
| DELETE | `groups/${channel.channelID}/bot_admin/${uid}`                       | `dmworkdatasource/src/datasource.ts:190` |
| PUT    | `groups/${channel.channelID}/bot_admin/${uid}`                       | `dmworkdatasource/src/datasource.ts:186` |
| POST   | `groups/${channel.channelID}/exit`                                   | `dmworkdatasource/src/datasource.ts:13`  |
| DELETE | `groups/${channel.channelID}/managers`                               | `dmworkdatasource/src/datasource.ts:143` |
| POST   | `groups/${channel.channelID}/managers`                               | `dmworkdatasource/src/datasource.ts:149` |
| DELETE | `groups/${channel.channelID}/md`                                     | `dmworkdatasource/src/datasource.ts:170` |
| GET    | `groups/${channel.channelID}/md`                                     | `dmworkdatasource/src/datasource.ts:162` |
| PUT    | `groups/${channel.channelID}/md`                                     | `dmworkdatasource/src/datasource.ts:166` |
| DELETE | `groups/${channel.channelID}/members`                                | `dmworkdatasource/src/datasource.ts:73`  |
| GET    | `groups/${channel.channelID}/members`                                | `dmworkdatasource/src/datasource.ts:90`  |
| POST   | `groups/${channel.channelID}/members`                                | `dmworkdatasource/src/datasource.ts:80`  |
| PUT    | `groups/${channel.channelID}/members/${subscriberUID}`               | `dmworkdatasource/src/datasource.ts:27`  |
| GET    | `groups/${channel.channelID}/qrcode`                                 | `dmworkdatasource/src/datasource.ts:121` |
| PUT    | `groups/${channel.channelID}/setting`                                | `dmworkdatasource/src/datasource.ts:130` |
| POST   | `groups/${channel.channelID}/transfer/${toUID}`                      | `dmworkdatasource/src/datasource.ts:20`  |
| GET    | `groups/${groupId}/membersync?version=${version}&limit=10000`        | `dmworkdatasource/src/module.ts:177`     |
| GET    | `groups/${groupNo}/threads`                                          | `dmworkdatasource/src/datasource.ts:208` |
| POST   | `groups/${groupNo}/threads`                                          | `dmworkdatasource/src/datasource.ts:222` |
| DELETE | `groups/${groupNo}/threads/${shortId}`                               | `dmworkdatasource/src/datasource.ts:236` |
| GET    | `groups/${groupNo}/threads/${shortId}`                               | `dmworkdatasource/src/datasource.ts:227` |
| PUT    | `groups/${groupNo}/threads/${shortId}`                               | `dmworkdatasource/src/datasource.ts:240` |
| POST   | `groups/${groupNo}/threads/${shortId}/archive`                       | `dmworkdatasource/src/datasource.ts:232` |
| DELETE | `groups/${groupNo}/threads/${shortId}/md`                            | `dmworkdatasource/src/datasource.ts:182` |
| GET    | `groups/${groupNo}/threads/${shortId}/md`                            | `dmworkdatasource/src/datasource.ts:174` |
| PUT    | `groups/${groupNo}/threads/${shortId}/md`                            | `dmworkdatasource/src/datasource.ts:178` |
| PUT    | `groups/${threadInfo.groupNo}/threads/${threadInfo.shortId}/setting` | `dmworkdatasource/src/datasource.ts:138` |

### `message/*`

| Method | Path                                                                                                                                                                                                                                                                      | Callers                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| POST   | `message/channel/files`                                                                                                                                                                                                                                                   | `dmworkdatasource/src/datasource.ts:330`  |
| POST   | `message/channel/sync`                                                                                                                                                                                                                                                    | `dmworkdatasource/src/conversation.ts:50` |
| POST   | `message/extra/sync`                                                                                                                                                                                                                                                      | `dmworkdatasource/src/conversation.ts:71` |
| POST   | `message/readed`                                                                                                                                                                                                                                                          | `dmworkdatasource/src/module.ts:282`      |
| POST   | `message/reminder/done`                                                                                                                                                                                                                                                   | `dmworkdatasource/src/module.ts:270`      |
| POST   | `message/reminder/sync`                                                                                                                                                                                                                                                   | `dmworkdatasource/src/module.ts:258`      |
| POST   | `message/revoke?channel_id=${encodeURIComponent(message.channel.channelID)}&channel_type=${encodeURIComponent(String(message.channel.channelType))}&message_id=${encodeURIComponent(String(message.messageID))}&client_msg_no=${encodeURIComponent(message.clientMsgNo)}` | `dmworkdatasource/src/conversation.ts:31` |

### `space/*`

| Method | Path                       | Callers                                                                              |
| ------ | -------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `space/${spaceId}/members` | `dmworkdatasource/src/datasource.ts:459`<br>`dmworkdatasource/src/datasource.ts:539` |

### `sticker/*`

| Method | Path                                                            | Callers                                  |
| ------ | --------------------------------------------------------------- | ---------------------------------------- |
| GET    | `sticker/user/category`                                         | `dmworkdatasource/src/datasource.ts:379` |
| GET    | `sticker/user/sticker?category=${encodeURIComponent(category)}` | `dmworkdatasource/src/datasource.ts:382` |

### `threads/*`

| Method | Path                         | Callers                                  |
| ------ | ---------------------------- | ---------------------------------------- |
| POST   | `threads/${shortId}/join`    | `dmworkdatasource/src/datasource.ts:244` |
| POST   | `threads/${shortId}/leave`   | `dmworkdatasource/src/datasource.ts:248` |
| GET    | `threads/${shortId}/members` | `dmworkdatasource/src/datasource.ts:256` |

### `user/*`

| Method | Path                                                              | Callers                                  |
| ------ | ----------------------------------------------------------------- | ---------------------------------------- |
| DELETE | `user/blacklist/${uid}`                                           | `dmworkdatasource/src/datasource.ts:346` |
| POST   | `user/blacklist/${uid}`                                           | `dmworkdatasource/src/datasource.ts:343` |
| GET    | `user/qrcode`                                                     | `dmworkdatasource/src/datasource.ts:390` |
| GET    | `user/search?keyword=${encodeURIComponent(keyword)}${spaceParam}` | `dmworkdatasource/src/datasource.ts:387` |

### `users/*`

| Method | Path                              | Callers                                                                              |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------ |
| GET    | `users/${WKApp.loginInfo.uid}/im` | `dmworkdatasource/src/datasource.ts:496`<br>`dmworkdatasource/src/datasource.ts:505` |
| PUT    | `users/${uid}/setting`            | `dmworkdatasource/src/datasource.ts:134`                                             |

## `dmworklogin`

### `space/*`

| Method | Path                         | Callers                            |
| ------ | ---------------------------- | ---------------------------------- |
| GET    | `space/invite/${inviteCode}` | `dmworklogin/src/login_vm.tsx:117` |
| GET    | `space/my`                   | `dmworklogin/src/login_vm.tsx:384` |

### `user/*`

| Method | Path                              | Callers                                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------------------ |
| POST   | `user/email/forgetpwd`            | `dmworklogin/src/login_vm.tsx:330`                                       |
| POST   | `user/email/sendcode`             | `dmworklogin/src/login_vm.tsx:255`<br>`dmworklogin/src/login_vm.tsx:276` |
| POST   | `user/emaillogin`                 | `dmworklogin/src/login_vm.tsx:316`                                       |
| POST   | `user/emailregister`              | `dmworklogin/src/login_vm.tsx:301`                                       |
| POST   | `user/login`                      | `dmworklogin/src/login_vm.tsx:228`                                       |
| POST   | `user/login_authcode/${authCode}` | `dmworklogin/src/login_vm.tsx:207`                                       |
| GET    | `user/loginstatus?uuid=${uuid}`   | `dmworklogin/src/login_vm.tsx:450`                                       |
| GET    | `user/loginuuid`                  | `dmworklogin/src/login_vm.tsx:419`                                       |
| POST   | `user/usernameregister`           | `dmworklogin/src/login_vm.tsx:240`                                       |

---

## `dmworktodo` (特例:独立 axios + 独立 baseURL)

**重要**:todo 模块**不走** `WKApp.apiClient`,自己起 `matterAxios = axios.create({ baseURL: "" })`,
**base path 是 `/matter/api/v1`**(非 `/v1`),由 nginx 路由到 matter 子服务。
鉴权 header 同主站(Authorization Bearer token)。

来源:`packages/dmworktodo/src/api/todoApi.ts`(14 个端点)+ `imMessageApi.ts`(2 个端点,走 WKApp.apiClient)

### `/matter/api/v1/matters/*`

| Method | Path                                   | Caller                        |
| ------ | -------------------------------------- | ----------------------------- |
| GET    | `/matters` (?params)                   | `listMatters`                 |
| GET    | `/matters/${id}` (?source_channel_id)  | `getMatter`                   |
| POST   | `/matters`                             | `createMatter`                |
| PUT    | `/matters/${id}`                       | `updateMatter`                |
| PUT    | `/matters/${id}/status`                | `transitionMatter`            |
| DELETE | `/matters/${id}`                       | `deleteMatter`                |
| POST   | `/matters/${id}/assignees`             | `addAssignee`                 |
| DELETE | `/matters/${id}/assignees/${userId}`   | `removeAssignee`              |
| POST   | `/matters/${id}/channels`              | `linkChannel`                 |
| DELETE | `/matters/${id}/channels/${channelId}` | `unlinkChannel`               |
| POST   | `/matters/extract`                     | `extractMatter` (AI 智能创建) |
| GET    | `/matters/${id}/timeline` (?params)    | `listTimeline`                |
| POST   | `/matters/${id}/timeline`              | `addTimelineEntry`            |
| DELETE | `/matters/${id}/timeline/${entryId}`   | `deleteTimelineEntry`         |
| GET    | `/matters/${id}/activities` (?params)  | `listActivities`              |

### IM message 单条查询(走 WKApp.apiClient)

| Method | Path                                                     | Caller                             |
| ------ | -------------------------------------------------------- | ---------------------------------- |
| GET    | `groups/${groupNo}/messages/${msgId}`                    | `imMessageApi.ts:getGroupMessage`  |
| GET    | `groups/${groupNo}/threads/${shortId}/messages/${msgId}` | `imMessageApi.ts:getThreadMessage` |

---

## 迁移建议

1. **不要预抽**:本清单只是 P3 业务驱动时的参考。每个 feature 起步时按需在 `features/<feat>/api/<resource>.api.ts` 抽真正用到的端点。
2. **基础设施类(P2 必用)**优先抽:
   - `user/login`(已抽,见 `features/login/mutations.ts`)
   - `user/current` — 当前用户信息(\_auth.tsx beforeLoad 兜底)
   - `user/reddot/friendApply` — sidebar contacts badge
   - `users/${uid}/setting` — 用户偏好
3. **base 子系统**(conversation / channel / groups)抽到 `features/base/api/endpoints/` — P2 IM 链路用得到。
4. **matter 单独前缀**:`features/matter/api/matter.api.ts` 内部建独立 `$matterFetch = $fetch.create({ baseURL: "/matter/api/v1", ... 拦截器同 base })`。
5. **类型**:旧项目大部分 `apiClient.get(...)` 用 `<Resp>` 泛型;迁移时配合 zod schema 在 `features/<feat>/api/<resource>.schema.ts` 做运行时校验(可选,简单接口可直接 type-only)。
