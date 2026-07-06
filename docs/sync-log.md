# octo-web — 同步日志

## Upstream Baseline

- upstream: <https://github.com/Mininglamp-OSS/octo-web>
- baseline SHA: `f32a1360` (2026-05-22 — `feat(matters): UI optimization aligned with Figma (#78)`)
- last audited: 2026-06-08

> 本仓不是 fork,是用一套约束化前端工程模板搭建后**复刻业务**得来。
> 上游 `Mininglamp-OSS/octo-web` 是变更源,本字段记录"业务对齐到上游哪个 commit"。
>
> Historical sync workflow:
>
> 1. `pnpm scan:upstream` → 列 baseline..HEAD 未搬变更(按目录 bucket)
> 2. 项目负责人挑要搬的 SHA → AI 按 polish 同款流程实现 → MR 合并
> 3. 合并后更新本字段 baseline SHA + last audited + 本日志追加 batch 记录

## 2026-05-22

- from frontend engineering template commit: 8e05d5a (branch: scaffold/harness-skeleton)
- copied: `.claude/` `.ai/`(去掉 traces) `scripts/` `.oxlintrc.json`
- CLAUDE.md: 原样保留约束语义,改第一行项目名+Who段一句自述,删"接 OCTO 的潜在关系"段
- AGENTS.md: harness schema 索引作主体,末尾保留 vp 注释块
- package.json: 合入 harness scripts + tsx devDep + harness.generatedDirs

### Phase D verified at 2026-05-22 14:46

PreToolUse hook 真触发验证通过:

- Step 1 self-check 全绿(`vp check` / `structure-lint` / `wiki-lint`)
- Step 2 触发硬阻断:写 `src/bad.tsx`(useEffect+fetch)被 deny,trace 命中 `["no-useeffect-fetch", "no-useeffect-in-component"]`
- Step 3 反向验证:`src/main.tsx` 末尾加 `// hello` 顺利通过

### Phase D 期间发现并修复的三个坑

1. **lint 配置分裂**:harness 模板把 oxlint 业务规则放 `.oxlintrc.json`,但 `vp create` 生成的 `vite.config.ts` 自带 `lint` 块,导致 `vp check` 走 vite.config.ts 配置时**根本不加载** `.oxlintrc.json` 的 `jsPlugins`(taste/\* 规则全失效);加 `-c .oxlintrc.json` 又会触发 oxlint `argument -c cannot be used multiple times`(vp 内部已注入一次 -c)。
   - 修法:把 `jsPlugins: ["./.ai/taste/oxlint-plugin/index.js"]` 和 `taste/no-useeffect-*` 规则迁到 `vite.config.ts` 的 `lint` 字段,作为单一权威来源。
2. **hook 显式传 -c 噪音**:同上,`pre-tool-use.sh` 和 `post-tool-use.sh` 里 `vp check --no-fmt -- -c "$CLAUDE_PROJECT_DIR/.oxlintrc.json" "$TMP_FILE"` 去掉 `-c ...`,让 vp 走 vite.config.ts 单一配置。
3. **Edit 路径 tmp 误伤合法文件**:旧 hook 把 tmp 写到 `$CLAUDE_PROJECT_DIR/.tmp-hooks.XXX/pre.tsx`,导致相对 import(`./index.css` 等)解析失败 → TS2882/TS2307,任何 Edit 含相对 import 的 src 文件都会被误拦。改为同目录 + 非 hidden 前缀(`<basename>.preview-tmp-$$-$RANDOM.tsx`)+ trap 兜底删,既让 oxlint type-aware 上下文(tsconfig include + vite-plus/client 类型)正确,trap 也保证不污染 src/。

### Backlog → 回灌 harness

- **vp create 模板与 .oxlintrc.json 设计冲突**:harness 的 `vp create react-ts` 模板生成的 vite.config.ts 内联了 lint 配置,与 harness 自带的 `.oxlintrc.json`(挂 jsPlugins + taste 规则)是两套独立来源,会让业务规则失效。harness README 应警告:**新建项目后,把 .oxlintrc.json 的 jsPlugins + 自定义规则手动合并到 vite.config.ts 的 lint 字段,然后删除 .oxlintrc.json**(或反过来,但二选一,不能并存)。
- **hook tmp 文件位置约定**:`pre-tool-use.sh` 注释里的 K10 备注已过时(说"tmp 必须放 project 内非 ignorePatterns 内"),实测还需要"放原文件同目录、非 hidden、tsconfig include 能匹配到",否则 type-aware 上下文不对。harness 该 hook 同步修。

## 2026-06-08 — Batch 1.1 i18n 基础设施

- MR: 旧 `0003639/octo-web-2!29` review/合并(迁仓后 path 失效);现仓 `frontend/octo-web-2` main 已含对应 commits
- Internal repository path changed during migration(2026-06-08 后)
- 搬了 2 个上游 SHA:
  - `b79eab8d` 整套 i18n runtime + locale(本仓 src/lib/i18n/,9 文件 + 2 locale JSON)
  - `fe5bbc5d` backend language contract — 只搬 Accept-Language interceptor 部分
- 跳过 1 个:
  - `f223293f` Semi locale sync — 本仓不用 Semi UI
- 跳过 fe5bbc5d 内的 backend user.language sync — 本仓登录流程未复刻该接口
- 本仓 commits:362c7b9 / cc1c15d / c131e9c / 6d0df3e / 50549bb / 25e13c4 / bf26ad4 / d9a9c3a / b3ee9fb / 6e2f03a(10 个 commit,8 个 feat + 2 个 fix:i18n namespace 修正、语言切换入口挪到 NavRail)
- 156 业务 file 改 t() 调用,locale 287 → 2738 keys
- 架构关键点:`useT()` reactive hook(useSyncExternalStore 订阅 i18n.subscribe);非 React 上下文用 `import { t } from "@/lib/i18n/instance"`
- 切语言入口:NavRail 底部齿轮上方 Languages 图标

## 2026-06-09 — Batch 1.2 chat 输入框 / mention

- Internal merge request reviewed and merged.
- 搬了 7 个上游 SHA(2 合并到 1 commit):
  - `006b2411` 粘贴列表保留多行(extractOrderedBlocks 平铺→递归)
  - `2e89e772` 语音 @所有AI/@所有人 三态拆分
  - `405bbe98` @所有AI sender 侧展开 bot uids(GH#100)
  - `90556da2` + `76189c1d` receiver 侧合并:text-renderer 加 broadcast 高亮 + ais routing uid fail-closed guard
  - `ff46fa58` 私聊隐 broadcast sticky + file-reply 不 @ 私聊对方
  - `bbac229d` 拒绝文件夹拖入(webkitGetAsEntry + size==0 兜底)
- 跳过 1 个:
  - `e33d3887` mention textBetween leafText — 新仓 voice 简化为"录音→文件",无 voice-to-text 编辑模式,无对应 code path
- 跳过子改动:
  - 405bbe98 / 90556da2 上游 receiver 侧 `Service/Model.tsx` MessageWrap legacy parser 改动 — 新仓 text-renderer 直接看 mention 字段,不走旧解析路径,加 fail-closed guard 等效防护
  - 90556da2 上游 sender 侧 entities sentinel — 新仓 send-content-proxy 不解析 entities,靠 receiver 兜底
- 本仓 commits:ddb9d91 / b8d6fee / bcff516 / 9c8d7b3 / 25d4f56 / 3c303b7(6 个 commit)
- 关键决策:90556da2 + 76189c1d 合并 commit,避免拆细影响 review 连贯性

## 2026-06-09 — Batch 1.3 chat 会话列表 / 排序 / 折叠

- Internal merge request reviewed and merged.
- 搬了 12 个上游 SHA(plan 内 9 + baseline 后补 3):
  - `f85ba4d0` trust backend recent(删 3 天前端硬过滤)
  - `1f8c40a2` 最近 tab 重复点击跳第一条未读(chat-recent-jump store + reactive hook)
  - `de16d69f` mention reminder 过滤防 @我 双显
  - `5dbc0c40` setActivatorNodeRef 隔离 drag activator
  - `645fa295` 隐藏归档子区 + 新建 lib/thread-status.ts;后续补 hasThreads / aggregateThreadUnread 用 visibleThreads(漏改修复)
  - `35b35757` thread panel item Star follow + sidebar invalidate
  - `72a8adc3` clearUnread 后 invalidate sidebarFollow query(替代 mittBus)
  - `2c5eccbb` 创建子区后 invalidate sidebarFollow(两路:thread-list-panel + message-row)
  - `1286d289` conversation/sync body 加 recent_filter:true
  - **(baseline 后补)** `1906c874` canManageThread 父群口径(两处归档入口共享权限)
  - **(baseline 后补)** `c13e7e27` inline 归档按钮 + 5s 撤销 toast(每行 Archive/ArchiveRestore button)
  - **(baseline 后补)** `23b59a41` 归档发消息 reactivate + composer archivedInputNotice
- 跳过 2 个:
  - `275762d7` compact thread collapse — 新仓 follow-list 独立 hook 体系,跟 ConversationList class 的 disablePinSplit 不同语义
  - `ff7f39f1` recent ordering on live updates — 新仓 sortConversations 已返新数组,useQuery 自动 refetch,无 ChatVM class 原地 sort 问题
- 验证发现并修复的数据/逻辑 bug:
  - listThreads 默认只返活跃 → 必传 `status:"all"` 才有"已归档"分组
  - is_followed 后端 ThreadRaw 字段可能不填 → 双源融合(sidebarFollow.followedKeys 推 `5::{channel_id}` 集合)
  - 排序口径 `last_message_at || updated_at || created_at`(对齐老仓 threadSortTime)
  - follow-list 父群 hasThreads / aggregateThreadUnread 漏过滤 archived(commit `4434597`)
- 本仓 commits:10a083b / c58ba56 / 47edeea / 208f8cb / 11de3ee / 327e935 / 2e7a803 / fef7d1c / 238f952 / 4434597 / b815d80 / 36716cd / 7b21fa0(13 commit)
- 关键决策:
  - 流程上首次实践"用户验证发现缺失功能 → 在同 MR 续 commit 全补"(对应项目负责人的 A 方案),不开补救 PR
  - baseline 后新增 SHA(c13e7e27/23b59a41/1906c874)纳入当前 batch,plan 文档显式标注"baseline 后补",避免下次拉远程时被当作未搬

## 2026-06-09 — Batch 1.4 chat 消息渲染 / 文件预览

- 搬了 6 个上游 SHA + 2 个等效已修(本仓简化设计天然无 bug):
  - `c1eaadca` align AI assistant history / fold session timestamps with message row
  - `4b2e89c0` prefer filename suffix over content.extension
  - `e41a1d7b` 合并转发文件卡片点击改预览
  - `817f87a6` image 发送 sending/failed overlay
  - `2b1c78c3` 群聊 AI/好友 备注名改完立即生效(不用退出会话)
  - `195625e8` 同 sender 长间隔(>10min)消息不聚合
  - **(等效已修)** `97dbec4d` fold session expanded 漏最后一条 — 本仓 `fold-session.ts` 简化版无 `slice(0, -1)`,`FoldSessionExpanded` 直接 `messages.map(...)` 全量渲染
  - **(等效已修)** `ed5cfbcd` AI fold session 内文件预览 — 本仓 `file-renderer.tsx` 整卡 click 走 `chatSidePanelActions.openFilePreview`(行 47-61),下载按钮 stopPropagation;fold session 内消息复用 MessageDispatch → FileRenderer,行为一致
- 本仓 commits:db2c66b / 78a497b / 2f0b75a / 2931e54 / 2edaa02 / 4b5d355(6 个 commit)
- 用户验证发现并修复的 P0 bug:**自己发送的图片成功后仍显示"发送失败"**
  - root cause:`use-messages-sync.hook.ts` statusListener 把 `reasonCode === 0` 当成功 — 但 SDK `ReasonCode.success = 1`,`0 = unknown`。每条 sendack 成功都被错判 Fail
  - 副 fix:删 `taskListener` 整段(原把 task fail/cancel 改 message.status,跟 sendack 双重写 status 引入 race;对齐上游 `dmworkbase/Components/Conversation/index.tsx:587-601` 设计,sendack 是 status 唯一权威,task 状态由 UI 层 renderer 自己 subscribe 显示)
  - 顺手补:`image-renderer.tsx` Fail overlay 可点 → 复用 `chatManager.send` resend(对齐 `MessageStatusBadge.tsx:113` 同款行为)
- baseline SHA 暂不推进(仅搬了 batch 1.4 涉及 SHA,未做整段 audit)

## 2026-06-09 — Batch 1.5 chat 会话窗口 / scroll / typing

- 搬了 4 个上游 SHA + 3 个等效已修 + 1 个不搬(共 8 个):
  - `c2f9e18e` screenshot 作为 message-continuity 边界(message-list.tsx isContinue 加 screenshot 检查)
  - `d8213ec1` 上传 preflight credentials(新增 services/upload-preflight.ts;composer.tsx sendImageFile / sendRegularFile gate preflight,失败 toast + return false 不入气泡;upload.api.ts 加 silent 选项)
  - `30185565` 草稿 mention placeholder 渲染(新增 lib/draft-preview.ts;conversation-typing-digest 用之;dropDraft + reactive store 部分本仓已有)
  - `7a42c23a` typing 卡死 + 重连补刷:TypingManager.resetAll + IMProvider 挂 Connected/visibilitychange listener;use-messages-sync 加 connectStatusListener 5s 去抖 invalidate 当前 channel(staleTime=Infinity 不自动 refetch)
  - **(等效已修)** `c1c17307` send ordering — 本仓 React Query 单一 cache(无 messagesOfOrigin / pendingMessages / sendQueue 多副本),按 timestamp 主键排序(message-list.tsx:227-232),无 NaN 风险,无业务 sendQueue 跟 SDK sendingQueues 对齐问题
  - **(等效已修)** `2ce66f09` typing as continuity boundary — 本仓 typing 消息在 use-messages-sync messageListener 直接 skip,根本不进 message list,无需 boundary 判定;fold session 不重复部分本仓简化版无此问题
  - **(等效已修 batch 1.3 已搬)** `23b59a41` thread archive state refresh
  - **(不搬 / feature deferred)** `1bfc1b4e` scroll anchor + offset 恢复 — 本仓 `useInitialScrollToBottom` 设计永远回底部,不做"切换会话恢复中间位置";已知 design simplification
- 本仓 commits(分支 feat/upstream-batch-1-5):e0ee9c7 / fd97c35 / b4eb95f / 535fdfa / d613e71(5 个 commit + 收尾 docs)
- 关键决策:`7a42c23a` 拆 2 个 commit(typing reset 一个、重连补刷一个),`d8213ec1` 因 pre-tool-use hook 死锁用 `await import()` inline 动态加载,合法 vite chunk lazy-load 模式
- baseline SHA 暂不推进

## 2026-06-09 — Batch 1.6 chat / contact 跨模块 + 群管理

- 搬了 2 个上游 SHA + 1 个不适用 + 1 个已在其他 MR 搬 + 1 个大半等效(共 5 个):
  - `ceffa569` + `bbac882b` 合并一个 commit:group-level allow-no-mention toggle 直接放 group-management-modal(本仓避免"放进 channel-setting 再挪走"的 churn,等效合并上游两个 PR)
    - api/channel.api.ts: ChannelInfoRaw 加 `allow_no_mention?`
    - api/channel-setting.api.ts: body type 加 + `setChannelAllowNoMention` helper
    - im-callbacks: orgData 默认 `allow_no_mention ?? 1`(零回归)
    - group-management-modal: 新 props `channelInfo` + `canManage`,owner/manager 可见 ToggleRow
    - channel-setting-modal: 透传新 props
    - i18n: zh-CN / en-US 各 2 keys(allowNoMention + toast.opFailed)
  - `8712d79e` 8 sub-feature 中 7 等效 / 1 适用搬:
    - **(等效已修)** mergeforward 切 Space 缺数据 — 本仓 forward-modal 走 React Query,不读 SDK 全局缓存
    - **(等效已修)** ConversationSelect 跨 Space 缓存残留 — 本仓 React state + useResetOnClose
    - **(等效已修)** friends dedup — forward-modal.tsx:262 已用 Set 去重
    - **(等效已修)** handleSpaceSelected race — spaceStore.setState 同步
    - **(等效已修)** "新建群聊"后 sidebar 跳 tab — 本仓 modal close 不动 activeTab + invalidate categories/sidebar
    - **(等效已修)** createCategory 返回 CategoryItem — follow.api.ts:56 已是
    - **(等效已修)** CreateCategoryModal 重名校验闪烁 — 本仓 InputModal validate 是 length-only,无重名检查
    - **(适用,已搬)** 右键"新建分组"会话归类:follow-list.tsx 加 pendingFollowAction state,onSuccess 拿 new CategoryItem 调 moveGroupMu/moveDmMu
  - **(不适用)** `b04a0618` Semi modal overrides — 本仓不用 Semi UI,无相关 CSS 冲突
  - **(已在其他 MR 搬)** `7bc98795` 右键撤回按角色权限隐藏 — 见 `fix/revoke-align-old-repo` MR(commit 77a55f6 / 8983b43);本 batch 不重复
- 本仓 commits(分支 feat/upstream-batch-1-6):50331a7 / 1f13959(2 个 commit + 收尾 docs)
- 关键决策:ceffa569 + bbac882b 合一 commit(本仓一步到位放 group-management,跳过"先放 channel-setting 再挪"中间态);8712d79e 拆 8 sub-feature 逐项判定,只搬 sub-5
- baseline SHA 暂不推进

## 2026-06-09 — Batch 1.7 contact P0

**0 commit 代码改动 — 2 等效已修 + 2 deferred**

- **(等效已修)** `2b974c00` 搜索结果可滚 — 本仓 contacts-directory.tsx:381 `flex min-h-0 flex-col overflow-y-auto` 已对齐上游 CSS 修复
- **(等效已修)** `ce693bd3` contacts tab 切换 — 本仓 filter chips 切换走 React `map` 数据变,DOM 不 unmount,scroll 自然保持;且本仓不用虚拟列表,无上游虚拟列表 scroll restore + index cache 复杂度
- **(deferred)** `f55f0bec` 私聊点加成员创群 — 本仓 channel-setting-modal isPerson 分支(line 376-381)只显示 avatar + title,**没有"加成员"入口**;不是 bug,是 feature 没实现;真要做需先实现私聊 → CreateGroup 入口,挪到 Phase 4 feature 列表
- **(deferred)** `5b65f5ce` matter recent files display — 跨 chat + matter + thread + file-preview + outputs 5 模块,老仓走 `WKApp.mittBus` event broadcast + state machine;本仓 React+TanStack store 架构完全不同,需要分钟级 store 改造,工作量重,单独立项
- 本仓 commits(分支 feat/upstream-batch-1-7):仅 docs 收尾(0 code change)
- 关键决策:**docs-only batch**(0 代码变更)— 记录 4 个 SHA 的等效 / deferred 理由,避免下次扫到时重复判断
- baseline SHA 暂不推进

## 2026-06-09 — Batch 1.8 chat 大特性 1:RichText 14 图文混合

- 搬了 3 个上游 SHA + 1 个 deferred(共 4 个):
  - `b1bb31df` 接收渲染 RichText=14:
    - content-types.ts 加 `richText: 14`
    - 新增 base/im/richtext-content.ts(RichTextContent / decodeJSON / buildRichTextPlain / conversationDigest 3 级 fallback)
    - register-content.ts 注册 SDK content
    - 新增 chat/message-renderers/richtext-renderer.tsx(text 纯文本 + image isSafeUrl 校验 + 全屏 lightbox)
    - dispatch.tsx 加 case
    - i18n message.digest.richText zh-CN / en-US
  - `b5a3b68e` 发送侧聚合 type=14:
    - richtext-content.ts 加 makeTextBlock / makeImageBlock / createRichTextContent factory
    - 新增 chat/services/upload-chat-media.ts(完整 credentials → PUT pipeline + isSafeUrl;SDK upload-task 内部上传时机不能用于聚合路径)
    - composer.tsx 加 sendRichTextMixed 路径:editor 同时有 text+image 且无 file → 聚合一条 type=14;mention all/humans/ais/uids 合并到单消息
    - 跳过 snapshot-aware cleanup(上游 b5a3b68e round-2 bug 修,本仓未发现该 race,留 backlog)
  - `fff36eb1` UI 迁移 + mergeforward + file 前向兼容:
    - 上游主体是 Cell → MessageRow + bridge + ui/message MixedContent 架构迁移,**本仓本来就是新架构,无需迁移**
    - 只搬 file block 前向兼容:richtext-content RichTextBlockType.file + RichTextFilePlaceholder,buildRichTextPlain 加 file 分支,richtext-renderer 新增 RichTextFile 卡片
    - mergeforward-renderer 加 RichText case(inline 实现,不复用 RichTextRenderer 因为 mergeforward modal 内不嵌全屏 lightbox 避免 double modal)
  - **(deferred / P3)** `39284abf` clipboard round trip:核心收发已闭合,clipboard round trip 是 UX 增量(复制 RichText 消息粘贴到别处);完整搬要 richTextClipboard.ts ~301 行 + composer paste 集成 + copy handler 改造 + credentials omit safety,工作量重,单独立项
- 本仓 commits(分支 feat/upstream-batch-1-8):2e6fdd3 / 6d63957 / b1f0bc6(3 个 code commits + 收尾 docs)
- 关键决策:b5a3b68e 跳过 snapshot-aware cleanup(本仓未发现该 race,留 backlog);fff36eb1 上游 UI 迁移本仓不需要;39284abf 完整搬工作量重,defer
- baseline SHA 暂不推进

## 2026-06-09 — Batch 1.9 chat 大特性 2:BotManage 三级下钻

- 搬了 2 个上游 SHA + 1 个等效已修(共 3 个):
  - `ee4275b4` bot remark inline 编辑:bot-detail-modal isFriend 时新增 SectionGroup + InlineEditRow,复用 user-info-modal 同款 setUserRemark mutation + 刷 SDK channelInfo cache(让群消息 senderDisplay 即时反映新备注)
  - `e7c5e0be` BotManage 三级下钻 + 免@回答群列表:**拆 2 commit**
    - **基础设施** commit:新建 `overlay/drilldown-drawer.tsx`(BaseDrawer + stack + push/back/reset,通用下钻 modal,以后 group-management 也可重构改用)+ `endpoints/robot-mention-pref.api.ts`(对接 octo-server `modules/robot/mention_pref.go`:listGroups cursor 分页 / setMentionPref / deleteMentionPref)
    - **feature** commit:新建 `chat/components/bot-manage-modal.tsx`(L2 menu + L3 mention-free list,用 DrilldownDrawer<"menu"|"mention-free">);bot-detail 加 owner-only 入口 button;group_allow_no_mention=false 时 toggle 禁用(对齐上游 disabled state);防竞态走 React Query key(robotId+q)自动 invalidate,**不需要**上游手写 generation vm;切 bot 时 resetKey 复位下钻栈
    - i18n 16 keys(zh-CN + en-US)
  - **(等效已修)** `d6c20ed4` avatar 上传统一:本仓 `uploadUserAvatar` + `uploadGroupAvatar` 核心 OK;GIF 保活 + 非 GIF 裁剪预览 + WKAvatarUploadPreview 组件是上游 enhancement;未发现 bug 暂不补
- 本仓 commits(分支 feat/upstream-batch-1-9):c4ef775(remark)/ e615bc3(DrilldownDrawer+API)/ 37af7a4(BotManage feature)+ 收尾 docs
- 关键决策:**拓展 BaseDrawer → 通用 DrilldownDrawer**(项目负责人明确"按本仓设计原则替代老仓 RoutePage,顺道拓展 base modal");本批 BotManage 用之,后续可重构 group-management / channel-setting 改用同款;e7c5e0be 拆 2 commit(基础设施 / feature)语义独立
- baseline SHA 暂不推进

## 2026-06-10 — Batch 1.10 chat 大特性 3:Voice 设置面板

- 全搬 5 个上游 SHA(本仓拆 4 commit):
  - **commit 1** `voice.api` 扩展(local-config / reset endpoint / document)+ `space-setting.api`(GET/PUT `/v1/user/space/setting`)+ `voice-feedback.ts` service(1:1 复刻上游 VoiceFeedback singleton:onTranscribeResult / uploadLocal / uploadFinal / submitAll / enable / disable)
  - **commit 2** `use-voice-config.hook`(React Query 拉 `/v1/voice/config` staleTime=Infinity)+ `use-space-feedback-setting.hook`(React Query 拉 space setting + 3 个 mutation:toggleVoiceFeedback / acceptVoiceInput / disableVoiceInput;同步 VoiceFeedback singleton enable/disable)+ `voice-feedback-notice.tsx`(BaseDialog 渲染 `/v1/voice/document/asr_service_doc` markdown + 反馈同意 checkbox + 隐私/协议链接)
  - **commit 3** `voice-settings-modal.tsx`(完整面板:voice 总开关触发 Notice / 反馈开关 / 本地 ASR section 含 URL+timeout+probe 表单 + Test Connection + Save + Reset)+ `settings-flyout.tsx` 加 "语音设置" FlyoutItem entry
  - **commit 4** `composer.transcribeAndInsert` 拿到 transcribe 结果后调 `onTranscribeResult`(remote source + requestId + AsrParams);`composer.send` 顶部调 `submitAll(editor.getText())` flush pending
- 后端 endpoint 已 ready(`modules/voice_adapter/adapter.go`:transcribe / config / context / document / local-config GET/PUT/DELETE/reset),`modules/user/api_space_setting.go`:GET/PUT `/v1/user/space/setting`(含 voice_input_enabled / voice_feedback_on / voice_feedback_notice_acked)
- 本仓 commits(分支 feat/upstream-batch-1-10):e61263b / 36c4357 / 3676e4c / 26c0c3b(4 个 code commits + 收尾 docs)
- 关键决策:
  - i18n keys `navRail.voiceSettings.*` + `navRail.voiceNotice.*` 之前已加(不带 `base.` 前缀,跟本仓约定不一致但既成事实,沿用)
  - VoiceFeedback service 通过 `await import()` 懒加载(composer 内),保持 voice feedback 可选;disabled 时所有方法 no-op
  - 不复刻上游 shared state listeners pattern → 用 React Query 自动多组件同步
  - 不接 DOMPurify(Notice doc 后端受信任内容,Markdown 组件 rehypeSanitize 已兜底)
  - Notice modal 跟 VoiceSettingsModal 互斥显示(`open && !showNotice`),避免视觉叠加
- baseline SHA 暂不推进

## 2026-06-10 — Batch 1.11 chat-summary chat-window 集成

- 全搬 2 个上游 SHA(本仓拆 7 commits):
  - `f27fbdd2` chat-window smart summary UI(33+ files 上游,本仓精简实施 6 commits):
    - **commit 1** API + types:`summary.api.ts` 加 batchStatus / getChatCandidates / getMemberCandidates / getTopicTemplates;listSummaries 接受 signal config;CreateSummaryParams 加 origin_channel_id/type(title 改可选,后端为空回退 topic);ListSummariesParams 加 origin_channel_id;onResponseError guard AbortError 透传(对齐老仓 axios.isCancel)
    - **commit 2** utils + constants:`channel-source.ts`(getSourceType WK channelType → SourceType 枚举,防呆 thread 5 不能直传后端);`template-resolver.ts`(LocalTopicTemplate i18n key 解析 + parameterized 模板首个 placeholder 选区);`chat-summary-events.ts`(CustomEvent 包装 + subscribe helper);`topic-templates.ts`(4 个前端兜底 + MAX_CHAT_SELECT=30)
    - **commit 3** `chat-side-panel` store 加 `kind="summary"`(taskId null=列表 / 非空=详情双栈),互斥规则跟 thread/matter/filePreview 一致
    - **commit 4** 创建 modal:**项目负责人明确"完美复刻老仓 chat-context 创建流"** — 不动现有 SummaryCreateModal(本期范围外),独立新建:
      - `template-card.tsx`(本仓 tailwind + tokens,替代老仓 inline style hover hardcoded)
      - `chat-selector-modal.tsx`(group→thread→direct 层次 + 三 tab + 模糊搜索 + max 30,嵌套 BaseDialog 自动 z-dialog-secondary)
      - `chat-summary-new-modal.tsx`(lg size,默认 selectedChats=[当前 channel],topic 空时显 4 模板;parameterized 模板点选填 placeholder label + 自动选区 + focus 时清掉;Enter 提交,成功 dispatch chat-summary-created)
    - **commit 5** chat panel + sparkle entry:
      - `chat-summary-panel.tsx`(壳子复用 useRightPanelResize + PanelSplitter,内容 list/detail 由 store.taskId 决定;header 内 ← 返回 / × 关闭)
      - `chat-summary-history.tsx`(按 origin_channel_id 拉列表 + 订阅 CustomEvent 自动 invalidate;轮询走 summariesQueryOptions 自带 refetchInterval;hover 删除 confirm)
      - `chat-header.tsx` 加 SummaryEntryButton(Sparkles):点击探测 listSummaries(origin_channel_id);成功 openSummary(null) 跳列表;失败 toast 不开 panel(P1 fix);AbortController 跟 channel 切换协同断
      - `chat-main.tsx` 加 `sidePanelKind === "summary"` → 渲染 ChatSummaryPanel
  - `123a12c6` NavRail badge + auto refresh(1 commit):
    - **commit 6** `summary-badge.query.ts` 独立 WAITING_CONFIRM 总数 query(30s stale + 60s refetchInterval);`sidebar.tsx` NavItem 加 badge 渲染(>99 显 99+),用 path 解析避开 module augmentation 冲突;`personal-section.tsx` confirm/decline mutation 顺手 invalidate summaryBadgeQueryKey 让 badge 立刻减
  - **commit 7** i18n 28 keys(zh-CN + en-US 各):common(loading/delete/deleteConfirm/remove/createFailedRetry)、create(submitting/topicPlaceholderInChat)、chatSummary(back/closeAria/createNew/panelTitle/starTooltip)、chatSelector(tabGroup/tabDirect)、templates 4 套
- 本仓 commits(分支 feat/upstream-batch-1-11):6600096 / 04f547d / 571168c / ddaa1c1 / 73c14eb / 322f505 / bfb9d70(7 个 code commits + 收尾 docs)
- 关键决策:
  - **不动 SummaryCreateModal**(项目负责人指示):chat-context 独立 ChatSummaryNewModal,主模块的统一调整后续 batch 单立
  - **panel 壳子用本仓统一**(项目负责人指示):复用 useRightPanelResize / PanelSplitter,内容逻辑对齐老仓,UI tailwind 化;不搬老仓 layoutWidth.ts splitter(老仓 commit 已知 ~70px 偏差 bug)
  - **NavRail badge 用 path 解析**:`item.to === "/summary"` 判定避开 staticData module augmentation 冲突;sidebar own summary→query 解析
  - **不搬 mittBus event 桥接**:React Query refetchInterval + invalidate 等效实现"任务完成自动刷新列表 + badge";路由切换不需要 wk:nav-menu-activated listener
  - **不搬 templates "getTemplates 已无 caller"分支**:上游 commit description 自己说"remove in follow-up",本仓不引入死代码
  - **不搬 ChatSummaryNewModal 全量 css**:本仓 tailwind + design tokens 替代,无 hardcoded `#3370FF` 等
  - **关键防呆 origin_channel_type**:必须用 SourceType 枚举(group=1 / thread=2 / DM=3),不是 WK SDK channelType(thread=5 会被后端 400 拒)
- **依赖**:后端 smart-summary 服务 `#61` 必须已部署(支持 origin_channel_id / chat-candidates / topic-templates endpoint);chat panel 入口探测请求会按当前 channelID 拉,后端不支持时 toast 友好提示
- baseline SHA 暂不推进

## 2026-06-10 — Batch 1.12 整批跳过

项目负责人 2026-06-10 决策:matter 模块本仓未复刻好,跟 matter 强相关的搬运一并 defer。

- [~] `66d474c9` refactor(todo): unify create-task modal — 等本仓 matter 模块完整再回头(本仓现状:两 modal 独立 — composer/matter.view 走 CreateMatterModal,selection-toolbar 走 SmartCreateModal)
- [~] `60afb75e` feat(matters): add 产出文件 tab — 后端 octo-matter outputs endpoint 状态未确认 + 12 files +1575 行跨模块改动,跟 matter 主模块一并 P3 立项

0 代码改动,只标 plan checkbox `[~]` 跟原因。

## 2026-06-10 — Batch 1.13 杂项小 fix

- 实际搬 1 个上游 SHA + 2 个等效已修/已搬过:
  - `0f024d2d` 2026-06-04 fix(group-md): render escaped newlines as markdown — **搬**:在 `src/features/chat/components/group-md-modal.tsx` 加 `normalizeGroupMdContent(content)` helper(literal `\n`/`\r\n` → 真换行 guard:已含真换行 / 不含 literal 时不处理),`useSyncDraftFromServer` 内对 server 内容 normalize 后再喂 textarea/preview
  - `12e579a4` 2026-06-03 fix: restore MeInfo modal content height — **等效已修**:本仓 `me-info-modal.tsx` 用 BaseDialog `className="h-[500px] w-[420px]"`(line 76)已对齐上游 CSS height:500px;无 Semi 依赖天然无样式迁移
  - `1906c874` 2026-06-08 fix: unify thread archive action visibility — **已在 batch 1.3 搬过**(commit `b815d80` / `4434597`),本仓已有 `thread-permission.ts` canManageThread + `thread-list-panel.tsx` 两处入口统一调用,本 batch 不重复
- 本仓 commits(分支 feat/upstream-batch-1-13):`4bd7244`(group-md normalize)+ docs
- 关键决策:**最小改动 batch**(1 个 code commit + 1 个 docs commit);0f024d2d 上游同时迁了 preview 从 `<pre>` 改 `MarkdownContent`,本仓 group-md-modal preview 已用 `ReactMarkdown`(无需迁),只补 normalize
- baseline SHA 暂不推进

## 2026-06-10 — Batch 1.14 Conversation drag-drop / 多选

- 搬 2 个上游 SHA(本仓拆 2 commits):
  - `361447b6` 2026-06-04 feat(conversation): widen drag-drop hit area + file-size guard + edge-case hardening — **部分搬**:
    - **[搬]** 第 2 块文件大小校验(单入口):`use-composer-attachments.hook.ts` addAttachments 顶部加 MAX_TOTAL_SIZE=100MB 守卫,单文件超限 / 累计超限分别 toast.error fileTooLarge / totalTooLarge,整批拒绝入队;累计判定包含 topAttachments + filesRef(inline 图片) + 本次 incoming;i18n 加 composer.upload.fileTooLarge / totalTooLarge(zh/en)
    - **[等效已修]** 第 1 块扩大 hit area:本仓 composer.tsx 把 onDrop/onDragOver 直接挂在 form,无"展开态 inert/height:0 隐藏"问题,无需上移监听
    - **[等效已修]** 第 3 块拖拽边界(dataTransfer.types === Files):本仓 onDragOver line 717 已检 `e.dataTransfer?.types?.includes("Files")`
    - **[不搬]** 深度计数 \_dragDepth:本仓 form 单层无嵌套 dragenter 区域,无闪烁 bug,后续若出现再补
  - `930b8fa5` 2026-06-02 fix: unify message multiselect behavior — **搬**:
    - 新增 `src/features/chat/lib/message-selection.ts` 暴露 isMessageSelectable + UNSELECTABLE_MESSAGE_TYPES set(time/-1 / typing/-2 / historySplit/-3 / threadCreated/1100)
    - `message-row.tsx` 加 `selectable = isMessageSelectable(message)`:onRowClick 不可选时不 toggle;checkbox 槽位保留对齐避免文字跳动,内部不渲染勾选框;cursor-pointer 仅可选项显示
    - 防止后续转发/批量操作命中 system message 被后端 400
- 本仓 commits(分支 feat/upstream-batch-1-14):`7b0b590`(file size guard)/ `da68433`(multiselect selectable)+ docs
- 关键决策:
  - 不搬上游 \_dragDepth(本仓 form 单层挂事件,无嵌套 dragenter 区域)
  - 不搬扩大 hit area / 遮罩层 z-index 调整(本仓 form 已直接覆盖整个编辑框)
  - checkbox 槽位为不可选项保留(对齐多选模式视觉,避免文字跳动)
- baseline SHA 暂不推进

## 2026-06-10 — P1 Login 模块 batch

- 搬 4 个真改动 SHA + 2 个等效已修 + 1 个微调合并(共 7 个):
  - `5ef5150f` SSO panel redesign + `1bf42ba2` 非 SSO spacing — **业务对齐 UI 自有**(项目负责人明确):
    - SSO + 非 SSO 共用顶部 breadcrumb(紫色圆点 + "登录到 Octo · Web")
    - SSO 主按钮加 Shield icon(信任增强);meta 行重排 Shield + "身份认证由 X 提供 · 企业级安全"(本仓既有 ssoMetaTrust key 终于上线)
    - 共用 DownloadDivider:两侧细线 + "也可下载移动版"(主 SSO 流程 vs 下载备用的视觉分层)
    - 非 SSO 底部链接 spacing mt-5 → mt-6 mb-2
    - i18n 加 downloadDivider 1 个新 key
  - `7de93ff1` Aegis migration notice — **业务对齐 UI 自有**:
    - 新增 LoginMigrationModal 组件:BaseDialog size=lg + StepRow + CaseRow 子组件;3 步 + 邮箱一致(success)/不一致(warning)2 case + bindWarning
    - 触发点 1:SSO 主按钮守门(未确认时弹,确认后才起 SSO)
    - 触发点 2:meta 行下方 "了解登录方式变更" link(任意时机查看)
    - ack key 带版本 `octo-login-migration-notice-v1-ack`(per-browser,后续重提示升 v2)
    - appconfig 加 suppress_login_migration_notice 字段(部署侧强制隐藏)
    - 注册 CTA 派生 provider.accountUrl + AEGIS_REGISTER_PATH "/register",accountUrl 缺失时隐(不写 prod/test fallback)
    - i18n 26 keys(zh/en 各):title/kicker/summary*/important*/step1-3 + Label/Hint/sameEmail*/differentEmail*/bindWarning\*/registerAegis/continueLogin/link
  - `86c5837b` OIDC logout — **搬**:
    - 新增 src/features/login/oidc/logout.ts(requestOidcLogout / safeEndSessionUrl / markOidcPostLogoutCleanup / consumeOidcPostLogoutCleanup / logoutUserInitiated / runPostLogoutCleanupIfNeeded)
    - AuthUser 加 login_provider 字段(post-login-flow 从 pending OIDC session 读出)
    - authActions.signOut 改 wire 到 logoutUserInitiated:SSO 走完整流程(调后端 → 标志 → 清本地 → 跳 IdP end_session_url);非 SSO / 失败 fallback 走原 clearLocalAndRedirect
    - main.tsx 在 persistAuth 之前调 runPostLogoutCleanupIfNeeded(IdP 回源到 /login 时兜底清残留 token / pending)
  - `43e7d354` disable_user_create_space — **搬 infra only**:
    - 新增 src/features/base/lib/parse-remote-bool.ts:统一解析后端 bool 字段(number 1 / boolean true / string "1"|"true")
    - appconfig.api.ts 加 disable_user_create_space 字段;appconfig.query.ts 加 useCanCreateSpace() hook(loading 时默认 true 乐观假设)
    - **本仓 SpaceSwitcher 无创建入口可隐**(只有"加入新 Space"),infra 接好供后续若加创建入口时直接 wire useCanCreateSpace
  - `2d4d4d51` button copy — **等效已修**:本仓 login.login.ssoButton 已是"Octo 登录"
  - `89d56e35` no-space logout — **等效已修**:本仓 join-space.view line 97 已有 onLogout = authActions.signOut
- 本仓 commits(分支 feat/upstream-login):`b0d3f5e`(SSO UI)/ `516f7e0`(OIDC logout)/ `22b3177`(disable space infra)/ `ae2b4e4`(Aegis migration)+ docs
- 关键决策:
  - SSO redesign 按项目负责人指示"业务对齐 UI 自己"— breadcrumb / Shield / 信任锚 / 下载分隔线 4 个业务元素全搬,UI 不复刻上游 --wk-sso-accent CSS 变量方案,本仓 tailwind direct expression
  - Aegis migration 完整搬(项目负责人 "本仓后面也要用 aegis"):27 i18n keys + 完整 modal 业务流程 + appconfig suppress + localStorage ack flag;UI 用 BaseDialog 替代 Semi Modal
  - OIDC logout 简化版:不搬 dev-only VITE_OIDC_POST_LOGOUT_REDIRECT_URI override(用户没明确需要);clearLocalAuthState 只清本仓存的 3 个 key(octo:auth / currentSpaceId / pending_oidc_login),不按 prefix 扫整个 storage
  - disable_user_create_space 只搬 infra:本仓无创建入口可隐(SpaceSwitcher 只 join 不 create),字段+helper 接好让后续加创建时直接 wire
- baseline SHA 暂不推进

## 2026-06-15 — Batch 2 全功能覆盖计划

- 新仓已切回并同步 `main`: `frontend/octo-web-2` `origin/main` = `f9cb5e1`
- 已从远程 `main` 创建文档分支: `docs/upstream-batch-2-plan`
- 老仓重新 fetch: `<legacy-octo-web-worktree>` `origin/main` = `b884e01e`
- 从上一正式 audit checkpoint `1906c874` 到当前老仓 `b884e01e` 共 31 个 commit；本次相对上一版计划新增 `b0c9a96d..b884e01e` 的 27 个 commit
- 重点新增功能域:
  - Summary Schedule: interval day/week/month、source_name submit 清理、source 后缀保留、one-to-many 删除确认
  - Chat / Thread / Forward: thread unread、archived thread 展开/同步、fold session locate/recall、forward picker cold cache 和 thread 转发
  - Webhook / Group: group incoming webhook 管理、webhook URL 示例、group owner transfer、批量 bot admin
  - Voice / Mention / Message Render: verified real name、@所有人 DOM 回归、rich text preview linkify、sticker category 不适用
  - CI: 老仓 GitHub Actions commits 在新仓无 `.github`，暂标记不直接搬
- 更新计划文档: `docs/upstream-batch-2-plan.md`
- Batch 2 策略:不沿用 Batch 1 的“仅覆盖 chat/contact/login 主线”;本轮把 Batch 1 deferred/backlog 项重新纳入,按 chat input / secrets / summary schedule / thread-forward / webhook-group / matter / contact-persona-appbot 全功能闭环执行。

## 2026-06-15 — Batch 2.8 CI / 文档回填

- 分支: `feat/upstream-batch-2-8`
- CI 判定:
  - `48fdecd3` / `fd8780de` / `6deadc6a` / `517b87b3` / `5bc525d8` 均只修改老仓 `.github/workflows`。
  - 这些提交覆盖 GitHub reusable workflow pin、issue/PR 通知、CodeQL 调度、dependency-review、history-check、pr-title-lint、secret-scan 等 GitHub/org 平台治理项。
  - 新仓没有 `.github`，但已有自有 `.gitlab-ci.yml`，覆盖 main 分支 `pnpm build`、Docker package、K8s deploy；直接搬 GitHub Actions 不服务当前仓库,也会引入错误平台假设。
  - 本批明确不搬 CI workflow。后续若需要安全/质量 gate，应按本仓 GitLab CI / 平台 CI 规范单独立项。
- 文档回填:
  - `docs/upstream-batch-2-plan.md` 补充 CI 不搬依据。
  - `docs/upstream-batch-1-plan.md` 将 `39284abf` RichText clipboard round trip 从原 deferred / P3 改为“后续 issue #125 / MR !122 已完成”。

## 2026-06-26 — Batch 3 新增上游发现记录

- 分支: `codex/upstream-batch-3-records`
- 老仓路径:`<legacy-octo-web-worktree>`
- 上次记录点:`b884e01e`(`v1.4.3`)
- 可做截止时间:`2026-06-22 24:00:00 +0800`;可做截止 commit:`3f3059ee`
- 本批可做范围:`b884e01e..3f3059ee`,共 20 commits / 113 files changed / +9446 / -765
- 本批可做功能域:
  - ChannelSearch 基础:频道 / 子区内搜索 UI,含 all/message/media/file tabs、filter、空输入保护、早期 UI polish
  - Summary:ChatSelector tabs、sidebar quick-create schedule
  - Chat / Thread / Message 小修:auto-follow thread、bot file attachment 不折叠、thread rename 权限、API timeout、richtext pasted mention safety
  - 治理类:RELEASING / CONTRIBUTING / GitHub Actions 仍按新仓平台差异默认不直接搬
- 关键发现:`594e375f` 标题是 add channel search UI,但当前老仓线性历史中为 0 文件变更;ChannelSearch 主体实际落在前置 `a812a307`。后续迁移时必须按功能域看 `a812a307 + 594e375f + follow-up fixes`,不能只 diff `594e375f`。
- 更新计划文档:`docs/upstream-batch-3-plan.md`
- 本次只记录,未迁移代码,未推进 sync-log 头部 baseline SHA。

## 2026-06-26 — Batch 4 暂缓池记录

- 分支: `codex/upstream-batch-3-records`
- 暂缓起点:`3f3059ee`
- 老仓当前 HEAD:`553c1710`
- 暂缓范围:`3f3059ee..553c1710`,共 10 commits / 65 files changed / +7771 / -382
- 暂缓原因:2026-06-23 之后合入老仓的内容本周尚未正式上线,本周末上线后再进入迁移评估
- 暂缓功能域:
  - ChannelSearch follow-up:locate/keyword limit、forwarded inner message、sender count、snippet emoji、media preview
  - Summary 多人协作 UI
  - Webhook mention config / adapter examples / modal polish / short URL alias
  - raw HTML message、compact conversation online badge
- 更新计划文档:`docs/upstream-batch-4-plan.md`

## 2026-06-27 — Batch 4 新增提交补录

- 分支:`codex/update-batch-4-records`
- 老仓远端 HEAD:`6055b724`
- 新增范围:`553c1710..6055b724`,共 3 commits / 24 files changed / +1455 / -84
- Batch 4 暂缓总范围更新为:`3f3059ee..6055b724`,共 13 commits / 72 files changed / +9200 / -440
- 新增暂缓提交:
  - `d1b4a8f1` thread-scoped incoming webhooks frontend — 归入 Batch 4.3 Webhook follow-up;依赖 `octo-server #454` 子区 webhook 管理端点
  - `88e570cc` render rich channel search results — 归入 Batch 4.1 ChannelSearch follow-up;依赖搜索接口返回 rich_text / image / video 命中字段
  - `6055b724` localized adapter examples in webhook URL modal — 归入 Batch 4.3 Webhook follow-up;依赖 `octo-server #475` 返回 `adapter_examples`,旧后端可 fallback
- 本次只记录,未迁移代码,未推进 sync-log 头部 baseline SHA。
- 更新计划文档:`docs/upstream-batch-4-plan.md`

## 2026-06-27 — Batch 4 解锁

- 分支:`codex/upstream-batch-4`
- 老项目已确认正式上线。
- 老仓 `main` 已 fast-forward 到 `6055b724`;再次 fetch 后本地 `main...origin/main` 一致,无新增提交。
- Batch 4 状态从“暂缓”改为“可执行”。
- 后续按 `docs/upstream-batch-4-plan.md` 分组拆实现 MR;每个 MR 记录覆盖 upstream SHA 和验证结果。

## 2026-06-27 — Batch 4.1 ChannelSearch follow-up

- 覆盖上游 SHA:
  - `c2ea912b` locate 和 keyword limit polish
  - `a85207a6` render forwarded channel search inner messages
  - `7774db69` sender filter 独立计数
  - `a9b0151a` preview channel search media results
  - `88e570cc` render rich channel search results
  - `c16ffb9b` channel search snippet emojis
- 代码变更:
  - keyword 输入保留 64 rune 前端限制,补 IME composing 保护、到顶提示和重复 toast 抑制;定位继续复用本仓 `chatLocateMessageActions`。
  - 合并转发搜索结果映射并展示 `inner_messages`;新仓无 sender filter 数字 badge,不存在 sender 数量混淆问题。
  - 搜索图片结果点击接入会话同款全屏图片查看器;视频结果接入 file-preview side panel;补 video renderer 和 `mp4/mov/webm/...` registry。
  - `_search_all` / `_search` rich_text 命中映射到 `ChannelSearchItem.richText`;message_kind=image/video 命中映射为媒体结果。
  - 搜索结果富文本摘要支持 text / image / file block 展示,保留本仓 file-preview / media-preview 路径。
  - 图片/视频 tab 对齐老仓按月份分组平铺缩略图,默认侧栏宽度下一屏可展示多行媒体结果;all tab 保留混合结果列表。
  - 图片缩略图点击进入会话同款全屏图片查看器；图片无原图 URL 时用 `thumbUrl` 兜底预览；视频缩略图点击进入 file-preview。
  - 文件 tab 对齐老仓紧凑行式结果,一行展示文件名、发送人、大小、日期,hover 显示定位/下载操作;all tab 保留混合结果卡片。
  - 搜索结果打开文件/媒体预览时保留 ChannelSearchPanel 挂载,关闭预览后恢复原 tab / keyword / filter,避免回到默认“全部”。
  - snippet 高亮从 `dangerouslySetInnerHTML` 改为 React token 渲染;后端 `<mark>` 切开 `[有品位]` 等自定义 emoji token 时仍整图展示,其他 HTML 按文本输出。
  - 会话内聊天记录搜索入口对齐老仓:从 chat header 独立搜索图标调整为“聊天信息 / 群信息 / 子区信息”里的“查找聊天内容”行,点击后关闭设置抽屉并打开右侧搜索面板。
- 验证:
  - 用户在 `http://127.0.0.1:5174/` 登录后验证频道搜索基础路径可用。
  - `npx tsc -b`
  - `vp test run src/features/base/api/endpoints/search.api.test.ts src/features/chat/lib/channel-search-snippet.test.ts src/features/chat/file-preview/registry.test.ts`
  - touched-file `vp lint`
  - 浏览器 `http://127.0.0.1:5174/` 验证 chat header 无会话搜索图标;“更多”→“查找聊天内容”可打开右侧搜索面板;图片/视频 tab 为月份分组缩略图网格,图片点击打开全屏图片查看器,关闭后仍停留在图片/视频 tab;文件 tab 为紧凑文件列表;文件预览关闭后仍停留在文件 tab;console error = 0

## 2026-06-27 — Batch 4.4 Chat 小修

- 覆盖上游 SHA:
  - `6c379a18` show raw HTML in messages
  - `5e945f52` compact conversation list online badge
- 代码变更:
  - 通用 `Markdown` 渲染器在 remark 阶段把 raw HTML node 转成 text node,让 `<button></button>` 等源码在聊天里可见但不会执行。
  - 抽出 `shouldShowConversationOnline`,最近列表和关注 compact row 共用同一在线/1h 内离线判定;关注/分组紧凑行渲染缩小版在线点。
- 验证:
  - `npx tsc -b`
  - `vp test run src/components/ui/markdown.test.tsx src/features/chat/lib/conversation-online.test.ts`
  - touched-file `vp lint`

## 2026-06-27 — Batch 4.3 Webhook follow-up

- 覆盖上游 SHA:
  - `4a396d00` channel webhook 管理 UI 重做:mention config / adapter examples / modal polish
  - `553c1710` short `/v1/webhooks` alias
  - `d1b4a8f1` thread-scoped incoming webhooks frontend
  - `6055b724` localized adapter examples in webhook URL modal
- 代码变更:
  - `IncomingWebhook` 契约补 `allow_mention_all` / `allow_mention_bots` / `mention_uids` / `thread_short_id`,create/regenerate 响应补 `adapter_examples`。
  - Webhook 表单新增自动 @ 成员、@所有AI、@所有人配置;create/edit 请求体只发送必要字段,编辑清空 mention_uids 显式发送 `[]`。
  - 推送 URL 展示从 canonical `/v1/incoming-webhooks/...` 改写为短别名 `/v1/webhooks/...`;URL rows 支持 GitHub / GitLab / 企业微信 / 飞书 / Multica。
  - URL 弹窗优先渲染后端本地化 `adapter_examples`,支持步骤折叠和 header token 复制;旧后端无字段时回退到 urls-based 示例。
  - 群 Webhook API 增加可选 `threadShortId`,子区设置活跃态展示“消息推送”入口,使用父群 channel + thread short id 访问 `groups/{group}/threads/{short}/incoming-webhooks`。
- 验证:
  - `npx tsc -b`
  - `vp test run src/features/chat/lib/incoming-webhook.test.ts src/features/base/api/endpoints/group.api.test.ts`
  - touched-file `vp lint`
  - `git diff --check`
  - 浏览器 `http://127.0.0.1:5174/` reload 后 console error = 0

## 2026-06-27 — Batch 4.2 Summary 多人协作

- 覆盖上游 SHA:
  - `690c1329` multi-person collaboration UI for smart summary
- 代码变更:
  - Summary 类型补 `creator_id`、`can_remove_member`、`team_citations` 等多人协作字段。
  - API 补 `leaveSummary(taskId)` 和 `removeMember(taskId, uid)`。
  - Summary 列表卡片按 `creator_id` fail-safe 分流:creator 显示删除整个任务,非 creator participant 显示退出协作。
  - Summary 详情页补参与者退出、creator 移除成员、成员状态/报告折叠面板;本人个人报告也可展开/收起。
  - 个人模式详情补团队汇总展示,不再只显示当前用户个人结果。
  - Summary 主创建工作台补“选择参与者”操作,与“选择聊天 / 定时更新”并列;选择后创建/定时更新请求透传 `participants`。
  - `CitationText` 支持 `[Pn]` 团队人员引用;团队汇总隐私模式只解析 `[Pn]`,普通 `[n]` 保持纯文本,避免暴露他人原文。
- 验证:
  - `npx tsc -b`
  - `vp test run src/features/summary/components/citation-text.test.tsx`
  - touched-file `vp lint`
  - `git diff --check`
  - 浏览器 `http://127.0.0.1:5174/summary` reload 后可见“选择参与者”;点击后可打开参与者选择弹窗;console error = 0

## 2026-06-26 — Batch 3.1 ChannelSearch 基础

- 覆盖上游 SHA:`a812a307` / `594e375f` / `dbeba59e` / `3f3059ee`
- 实现:
  - `search.api.ts` 新增 ChannelSearch types + `messages/_search_all` / `_search` / `_search_media` / `_search_files` adapter
  - 新增 `ChannelSearchPanel`:all/message/media/file tabs、sender/date/sort filter、空输入保护、cursor pagination、file/media preview、message locate
  - Chat header 增加搜索入口;`chat-side-panel` 增加 `channelSearch` 互斥 panel state
  - 对齐老仓 `messages_search_on` 远程开关:后端未开启时隐藏入口并自动收起已打开面板
  - 补 zh-CN / en-US i18n
- 验证:
  - `npx tsc -b` 通过
  - touched files `vp lint ...` 通过
  - 全仓 `vp check --fix` 仍被既有 `src/features/chat/file-preview/renderers/pdf-renderer.tsx` 裸 `useEffect` 错误阻塞;另有既有 excel/pdf warning
  - Browser 登录态验证:强制打开面板时布局正常;当前环境真实搜索返回 `Not Found`
  - `curl http://127.0.0.1:5173/v1/common/appconfig` 确认测试环境未下发 `messages_search_on`;补 feature gate 后会话 header 搜索入口隐藏,控制台无 error
- 说明:实现中前向兼容了部分 Batch 4.1 ChannelSearch follow-up 能力,但 Batch 4 仍保持暂缓,上线后需逐项验收。

## 2026-06-26 — Batch 3.2 Summary quick-create / selector

- 覆盖上游 SHA:`1eaa7a0c` / `6ac0f936`
- 实现:
  - `ChatSelectorModal` tab 从「全部 / 群聊 / 私聊」改为「关注 / 最近 / 全部群聊 / 全部私聊」,默认关注
  - 关注 / 最近复用本仓 `sidebar/sync` 查询体系:`sidebarFollowQueryOptions` + 新增 `sidebarRecentQueryOptions`
  - `ChatSummaryNewModal` 新增定时更新入口,复用 `ScheduleConfigModal`
  - 创建总结成功后,若配置定时,调用 `createSchedule({ scope:"task", task_id })` 绑定到新 task;定时失败仅 toast,不阻断总结创建
- 验证:
  - `npx tsc -b` 通过
  - touched files `vp lint ...` 通过
  - Browser 登录态验证:新建总结弹窗可打开定时配置;聊天选择器显示「关注 / 最近 / 全部群聊 / 全部私聊」四个 tab,默认关注列表

## 2026-06-26 — Batch 3.3 Chat / Thread / Message 小修

- 覆盖上游 SHA:`a109fe24` / `99fe3630` / `6aefa34c` / `b0ac8ec5` / `160706b3` / `dbae7c5b` / `199406c3` / `595d5973`
- 实现:
  - 新建子区自动关注:父群已关注且子区未关注时,`ThreadListPanel` 和消息右键创建入口 best-effort 调 `followThread`
  - bot 附件消息不折叠:image / gif / smallVideo / file / richText 作为 fold session 边界,保证交付物可见
  - thread settings 重命名权限与归档权限统一到 `canManageThread`,允许父群 owner / manager 重命名
  - ofetch shared client 增加 20s request timeout,并补 timeout / network request error 本地化提示
  - richtext paste mention fail-closed:广播 sentinel 永远降级纯文本;普通 mention 必须匹配当前成员 UID + label / alias
  - draft 恢复拒绝广播 sentinel laundering;登录页 silent error 也能识别 timeout / network
- 等价 / 不适用:
  - `6aefa34c`:新仓会话列表未读数字已在第二行右侧,静音态已是灰色数字,无需再搬 UI
  - `160706b3`:新仓未发现启动期 device-record 请求 / `clientMsgDeviceId` 链路,不适用
  - `595d5973`:新仓未发现 deprecated friendApply reddot/nav badge 读取入口,不适用
- 验证:
  - `npx tsc -b` 通过
  - touched files `vp lint ...` 通过
  - `vp test run src/features/base/api/api-error.test.ts src/features/chat/lib/fold-session.test.ts src/features/chat/lib/rich-text-paste.test.ts` 通过,3 files / 8 tests

## 2026-06-26 — Batch 3.4 仓库治理 / 构建 / 脚本核对

- 覆盖上游 SHA:`ac80160e` / `cfa2edbe` / `3ed5fea3` / `fa3f8dae` / `8f52022a` / `68c0777e`
- 判定:
  - RELEASING / CONTRIBUTING / CODEOWNERS 属老仓 GitHub/org release 流程;新仓平台链路不同,不直接搬
  - `3ed5fea3` / `fa3f8dae` 只改 GitHub Actions;新仓无 `.github`,当前不搬
  - `68c0777e` 是 extension sidepanel forward menu;新仓无 extension app 目标,不适用
  - `8f52022a` 修复老仓 `scripts/i18n-scan.mjs` markdown table escape;新仓无同名 i18n scan markdown report 脚本,`merge-upstream-locales.mjs` 不生成 markdown table,不适用
- 备注:后续若把老仓 `i18n-scan.mjs` 引入新仓,必须同步 `escapeMarkdownCell` 的 backslash-before-pipe 转义规则。

## 2026-07-03 — Batch 5 org main 增量搬运

- 分支:`codex/upstream-batch-5-port`
- 老仓对照范围:`6055b724..4c4e9191`
- 本批覆盖上游 SHA:
  - `2bb0b45b` 自定义 emoji「尚方宝剑」:补 `public/emoji/custom_shangfang.png`,并纳入自定义 emoji fallback。
  - `fb4afa95` 服务端 emoji manifest:新增 `common/emojis` 拉取、localStorage 缓存、失败本地兜底、manifest 变更订阅;文本渲染和 picker 共用同一数据源。
  - `ac81b338` 输入框 emoji 前缀联想:新增 Tiptap Suggestion 扩展,中文自定义表情名两字前缀触发,Enter 选中时不发送。
  - `df69203a` 自定义贴纸面板:表情面板新增「我的贴纸」tab,支持 `sticker/user` 拉取、预签名上传、创建和删除贴纸;面板继续固定 460x372,贴纸首次切 tab 懒加载。
  - `05051d3c` `lottieSticker` 消息渲染:新增 content 注册和 renderer,bitmap 格式直接按 MessageRow 消息渲染,未知格式 fail-safe 文案。
  - `bdb24e6f` 建群弹窗升级:新增群名必填、群头像文字/颜色预览编辑,创建请求透传 `name/avatar_text/avatar_color`。
  - `abd91d47` webhook 名称输入 IME Enter guard。
  - `d85b885d` 删除普通成员 webhook 名称 `Webhook-` 前缀提示和 i18n key。
- 等效 / 不搬:
  - `f43d539c` 群解散已由 `codex/issue-218-disband-group` 覆盖。
  - `3a10056e` summary declined participant pending 口径已由后续 summary collaboration detail 覆盖。
  - `5819f3fc` folded message selected-text copy 已由 `ceb804b` 覆盖。
  - `21e62fa4` add/remove group members 后刷新本地 subscribers 已由加人/踢人成功后的 `syncSubscribes` 覆盖。
  - `ca6a5fa5` runtimes 管理后续在老仓 `4c4e9191` revert,本仓不搬。
  - `66ecb56d` / `2a30fd46` `@octo/docs` editor line:本仓无 `packages/docs` 目标,本批不搬;若 codex 也要承载 docs,需单独立项。
  - `b7b283bd` / `8cd94fcf` / `a3228c58` / `65eb9375` / `454fb793` 只涉及 GitHub Actions / org CI 治理,本仓 GitLab CI 平台差异,不直接搬。
- 验证:
  - `node -e` 解析 zh-CN/en-US locale JSON 通过。
  - `corepack pnpm exec tsc --noEmit` 通过。
  - `corepack pnpm exec vp lint` 触及文件通过。
  - `git diff --check` 通过。
  - 后续由项目负责人在远程分支上做浏览器验证。
