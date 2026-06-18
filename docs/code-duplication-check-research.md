# 代码重复率检查方案调研

数据检索日期: 2026-06-18

## 当前项目约束

- 项目形态: Vite Plus + React + TypeScript, pnpm 管理。
- 代码规模: `src/` + `scripts/` 下约 514 个 TS/TSX/JS/JSX 文件,约 6.8 万行。
- 现有质量脚本: `pnpm check`, `pnpm typecheck`, `pnpm build`。
- 当前 GitLab CI: 只在 `main` 分支触发 install/build/package/deploy,没有 MR 质量门禁。
- 接入策略建议: 先加本地可执行脚本和配置,确认阈值后再决定是否进 CI; CI 若接入,建议先 report-only 或 manual,避免一次性阻塞主线。

## 方案对比

| 方案                   | 定位                       | 优点                                                                       | 风险/缺点                                                                                                   | 适合程度                      |
| ---------------------- | -------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- |
| jscpd                  | 专门的 copy/paste detector | JS/TS 友好,本地 CLI 简单,支持阈值和多 reporter,能快速接入 pnpm script      | v5 是 Rust/native binary,锁包和跨平台要验证;阈值需要先扫一轮基线                                            | 高                            |
| SonarQube / SonarCloud | 平台型质量门禁             | 不止重复率,还覆盖 code smell/security/coverage/quality gate;适合组织级治理 | 需要 Sonar 服务、token、项目配置和 CI 集成;接入成本明显高于本地工具                                         | 中高,取决于公司是否已有 Sonar |
| PMD CPD                | 通用 Copy/Paste Detector   | 老牌 CPD,支持 JS/TS copy-paste detection,语言覆盖广                        | Java 生态工具,前端仓接入手感不如 npm 工具;报告和阈值体验偏传统                                              | 中                            |
| eslint-plugin-sonarjs  | ESLint 规则补充            | 能在 lint 阶段发现重复分支、相似函数、复杂度等问题;可跟现有 lint 心智接近  | 不是“重复率”工具,不能给全仓 duplication percentage;项目当前 lint 由 Vite Plus 管,接入 ESLint 也可能另起一套 | 低到中,适合作补充不适合主方案 |

## 候选方案细节

### 1. jscpd

- 官方定位是 copy/paste detector,当前文档强调 v5 使用 Rust engine,支持 223+ programming languages。
- npm `jscpd` 当前 latest 为 `5.0.10`,要求 Node `>=18`。
- 能通过配置控制检测路径、阈值、最小 token/行数、ignore pattern 和 reporter。
- 可输出 console/html/json/sarif 等报告,适合先做本地基线和后续 CI artifact。
- 与本项目匹配点:
  - 项目已经是 pnpm + Node 22 环境,满足 Node 要求。
  - 只需要 devDependency + `.jscpd.json` + `package.json` script,侵入性低。
  - 可以先排除 `src/routeTree.gen.ts`, `src/components/ui`, `dist`, `.ai`, `docs` 等生成/非业务目录。

建议接入方式:

```json
{
  "scripts": {
    "dupcheck": "jscpd src scripts --config .jscpd.json"
  }
}
```

初始策略:

- 先只扫描 `src` 和必要的 `scripts`。
- 初始阈值不要过严,先跑出 baseline;比如先用 `threshold: 5` 或 report-only 看真实重复率。
- 报告输出建议 `console`, `html`, `json`;CI artifact 可保留 HTML。

### 2. SonarQube / SonarCloud

- 官方定位是自动化代码质量和安全审查平台,支持 JavaScript/TypeScript/CSS 分析。
- 重复率是 Sonar 的一等指标,可进入 Quality Gate。
- npm scanner 方案为 `@sonar/scan`,当前 latest 为 `4.3.6`,要求 Node `>=18`。
- 与本项目匹配点:
  - 如果公司已有 SonarQube,这是长期治理最完整的方案。
  - 但它不是“只加一个重复率脚本”,需要服务端项目、token、CI secret、扫描范围、quality gate 策略。

建议接入方式:

- 若已有 Sonar 服务: 增加 `sonar-project.properties` + CI job,先不阻断 MR。
- 若没有 Sonar 服务: 不建议为了重复率单独引入。

### 3. PMD CPD

- PMD 的 CPD 是通用 copy-paste detector。
- 官方文档说明 JavaScript 支持 CPD,TypeScript 支持 Copy-Paste-Detection only。
- 与本项目匹配点:
  - 检测能力可以覆盖 JS/TS。
  - 但它是 Java 生态工具,对于 pnpm 前端仓的本地开发体验、锁版本、CI 缓存都不如 jscpd 顺手。

建议:

- 除非团队已有 PMD/Java 质量平台,否则不作为首选。

### 4. eslint-plugin-sonarjs

- npm latest 为 `4.0.3`,插件将 SonarJS 规则暴露给 ESLint。
- SonarJS 仓库当前承载 JS/TS/CSS 静态分析和 eslint-plugin-sonarjs。
- 它能抓一些“重复形态”的问题,例如重复分支/相似函数,但不是全仓重复率统计。
- 与本项目匹配点:
  - 当前项目 lint 入口是 Vite Plus 配置里的 oxlint/tsgolint 等,不是常规 ESLint config。
  - 单独引入 ESLint 插件可能会造成第二套 lint 栈。

建议:

- 不作为重复率主方案。
- 可以在未来需要 Sonar 风格规则时再评估。

## 推荐顺序

1. 首选 `jscpd`: 最贴合“代码重复率检查”,接入成本低,能先本地基线再决定 CI。
2. 组织已有 Sonar 时选 `SonarQube/@sonar/scan`: 更适合长期质量平台,但不适合轻量起步。
3. `PMD CPD`: 作为已有 PMD 生态时的备选。
4. `eslint-plugin-sonarjs`: 只作 lint 补充,不承担重复率。

## 待你确认的技术栈选择

- 轻量本地脚本: `jscpd`
- 平台质量门禁: `SonarQube/@sonar/scan`
- Java 生态兼容: `PMD CPD`
- lint 补充规则: `eslint-plugin-sonarjs`

## jscpd baseline

执行命令:

```sh
pnpm dupcheck
```

当前配置:

- 扫描范围: `src`, `scripts`
- 文件格式: `typescript`, `tsx`, `javascript`, `jsx`
- 最小重复块: 8 行 / 80 tokens
- 检测模式: `weak`(跳过注释 token)
- 报告输出: `.jscpd/report.html`, `.jscpd/jscpd-report.json`
- HTML 报告由 `scripts/jscpd-report.mjs` 基于 JSON 自研生成,包含左右对照、代码高亮和行级重复标记。
- 当前阈值: `100`,只用于本地观察现状,不阻断
- 忽略范围: `node_modules`, `dist`, `.ai`, `docs`, `src/routeTree.gen.ts`, `src/components/ui`, 测试文件

Baseline 结果:

| 指标            | 数值   |
| --------------- | ------ |
| 分析文件数      | 430    |
| 分析行数        | 65,159 |
| 重复块          | 26     |
| 重复行          | 442    |
| 重复行占比      | 0.68%  |
| 重复 token      | 2,962  |
| 重复 token 占比 | 0.84%  |

主要重复类型:

- UI 容器结构重复: `base-dialog` / `base-drawer`, popover 类组件。
- IM 内容转换与上传逻辑存在少量 TS 重复。
- 聊天选择/联系人列表重复: `add-members-modal`, `create-group-modal`, `forward-modal`。
- 会话列表渲染重复: `conversation-list` / `follow-list`。
- mention 渲染逻辑重复: `mention-aware-text` / `text-renderer`,这是目前最大块(64 行)。
- Matter / Summary 中的列表、picker、创建表单存在少量重复。

阈值建议:

- 现状重复率只有 0.68%,偏健康。
- 如果只做本地报告: 保持 `threshold: 100`,避免给开发制造阻断,用于随时查看报告。
- 如果后续接 CI 且只防止明显恶化: 建议先设 `threshold: 2`。
- 如果要长期质量门禁: 建议先清理或确认最大几处重复后再降到 `threshold: 1.5`。
- 暂不建议直接设为 `1`,因为它更像强门禁;当前阶段先用 `2` 防恶化更稳。

## CI / 定时建议

当前已接入 GitLab `dupcheck_report` 质量报告 job:

- 触发方式: 手动 pipeline(`CI_PIPELINE_SOURCE=web`)和定时 pipeline(`CI_PIPELINE_SOURCE=schedule`)。
- 不触发方式: 普通 `main push` 不跑重复率报告,避免影响现有部署链路。
- 构建部署保护: 原 `install_packages_test` / `package_test` / `deploy_test` 限制为 `main push` 才执行。
- 产物: `.jscpd/report.html`, `.jscpd/jscpd-report.json`,保留 14 天。

建议定时:

- 每周四 12:00,`Asia/Shanghai` 时区。
- GitLab schedule cron: `0 12 * * 4`。
- 建议目标分支: `main`。

阈值策略:

- 当前阶段: `.jscpd.json` 维持 `threshold: 100`,报告不阻断。
- 若后续要加阻断门禁: 建议第一条线设为 `2%`。
- 观察稳定后: 可考虑收紧到 `1.5%`。

## 参考链接

- jscpd: https://jscpd.dev/
- jscpd configuration: https://jscpd.dev/getting-started/configuration
- jscpd reporters: https://jscpd.dev/reporters
- jscpd CI/hooks: https://jscpd.dev/ci-and-hooks
- npm jscpd: https://www.npmjs.com/package/jscpd
- SonarQube metrics: https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition
- SonarQube JavaScript/TypeScript/CSS: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/languages/javascript-typescript-css
- SonarScanner for NPM: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/npm/installing
- npm @sonar/scan: https://www.npmjs.com/package/@sonar/scan
- PMD CPD: https://pmd.github.io/pmd/pmd_userdocs_cpd.html
- PMD JavaScript/TypeScript support: https://pmd.github.io/pmd/pmd_languages_js_ts.html
- npm eslint-plugin-sonarjs: https://www.npmjs.com/package/eslint-plugin-sonarjs
- SonarJS: https://github.com/SonarSource/SonarJS
