# octo-web — 同步日志

## Upstream Baseline

- upstream: <https://github.com/Mininglamp-OSS/octo-web>
- baseline SHA: `f32a1360` (2026-05-22 — `feat(matters): UI optimization aligned with Figma (#78)`)
- last audited: 2026-06-08

> 本仓不是 fork,是用 miaoa-fe-harness 全新搭建后**复刻业务**得来。
> 上游 `Mininglamp-OSS/octo-web` 是变更源,本字段记录"业务对齐到上游哪个 commit"。
>
> 工作流(详见 plan `~/.claude/plans/concurrent-sparking-bengio.md`):
>
> 1. `pnpm scan:upstream` → 列 baseline..HEAD 未搬变更(按目录 bucket)
> 2. 陈超挑要搬的 SHA → AI 按 polish 同款流程实现 → MR 合并
> 3. 合并后更新本字段 baseline SHA + last audited + 本日志追加 batch 记录

## 2026-05-22

- from miaoa-fe-harness commit: 8e05d5a (branch: scaffold/harness-skeleton)
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
- 迁仓:`git@codex.mlamp.cn:0003639/octo-web-2.git` → `git@codex.mlamp.cn:frontend/octo-web-2.git`(2026-06-08 后)
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

- MR: <https://codex.mlamp.cn/frontend/octo-web-2/-/merge_requests/10>(已合并)
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

- MR: <https://codex.mlamp.cn/frontend/octo-web-2/-/merge_requests/13>(已合并)
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
  - 流程上首次实践"用户验证发现缺失功能 → 在同 MR 续 commit 全补"(对应陈超的 A 方案),不开补救 PR
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


