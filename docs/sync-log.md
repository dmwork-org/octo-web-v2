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
