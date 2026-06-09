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
