# octo-web — 同步日志

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
