/**
 * taste rules 机器注册表
 *
 * 规则定义只在 rules.md 一份（human-readable）。本文件只是索引和实现状态，
 * 两者通过 `id` 绑定。
 *
 * 何时更新本文件：
 *   - 新加规则 → rules.md 加条目后，这里加对应注册项
 *   - 升级 severity（warn → error）→ 改这里
 *   - 实现迁移（pending → oxlint / ts-morph）→ 改 implementedBy
 *
 * Week 3-4 会有 scripts/taste-lint.ts 消费本注册表。
 */

export type Severity = "error" | "warn" | "off";

export type Implementer =
  | "oxlint-builtin" // vp check 内置已覆盖，本注册表仅登记
  | "oxlint-plugin" // 通过 .ai/taste/oxlint-plugin/ 的 JS Plugin 实现
  | "ts-morph" // 需要类型信息，走 scripts/taste-lint-type.ts 逃生口
  | "workflow" // 工作流/prompt 层规则，不由代码 lint 抓
  | "pending"; // Week 3-4 再实现

export interface RuleMeta {
  severity: Severity;
  /** rules.md 锚点，格式 "#<rule-id>" */
  mdSection: string;
  implementedBy: Implementer;
  /** 适用文件 glob，空数组表示所有文件 */
  appliesTo: string[];
  /** 标记需要类型信息的候选 — Week 3-4 决策是走 ts-morph 还是降级为纯 AST */
  requiresType?: boolean;
  /** 简短 note，说明为什么是 pending / workflow / builtin */
  note?: string;
  /**
   * 规则起源（Hashimoto AGENTS.md 模式，handoff §7.8）。
   * - 初始 20 条：'初始 20 条，handoff §6 列举'
   * - 后续新加规则：**必填**，记录哪一次真实 failure 触发的（PR / issue / 事故编号）
   * - 季度健康审查（§13.5）时，trigger 率低 + 无 failure 记录的规则直接删，防止官僚化
   */
  originFailure?: string;
}

export type RuleRegistry = Record<string, RuleMeta>;

/**
 * 初始 20 条规则的 provenance 来源（handoff §6 拍脑袋列举，不是 failure 驱动）。
 * 所有未显式填写 originFailure 的条目视为继承此值。
 *
 * **Week 3-4 起新加规则必须显式填写 originFailure**（handoff §7.8）。
 * 季度健康审查（§13.5）时，trigger 率低 + 无 failure 记录的条目直接淘汰。
 */
export const INITIAL_PROVENANCE = "初始 20 条，handoff §6 列举（非 failure 驱动）";

export const rules: RuleRegistry = {
  // ==================== A. TanStack Router ====================

  "no-useeffect-in-component": {
    severity: "error",
    mdSection: "#no-useeffect-in-component",
    implementedBy: "oxlint-plugin",
    appliesTo: ["**/*.tsx"],
    note: "component(大写+JSX)禁止裸 useEffect,必须抽到命名 use* hook。零例外。",
  },

  "no-useeffect-fetch": {
    severity: "error",
    mdSection: "#no-useeffect-fetch",
    implementedBy: "oxlint-plugin",
    appliesTo: ["**/*.tsx"],
    note: "useEffect 回调内禁止 fetch/ofetch(和 no-useeffect-in-component 正交,哪怕包进 use* hook 也不行)",
  },

  "url-state-via-usesearch": {
    severity: "error",
    mdSection: "#url-state-via-usesearch",
    implementedBy: "pending",
    appliesTo: ["**/routes/**/*.tsx"],
    note: "CLAUDE.md 硬禁(useState 存 URL 状态)→ 升 error(2026-05-06 audit)。实现前在 review 层把关",
  },

  "route-error-component-required": {
    severity: "warn",
    mdSection: "#route-error-component-required",
    implementedBy: "pending",
    appliesTo: ["**/routes/**/*.tsx"],
    note: "TanStack Router 官方推荐,但未验 pilot 真踩过 → 降 warn 观察(2026-05-06 audit)",
  },

  "use-filebased-route": {
    severity: "error",
    mdSection: "#use-filebased-route",
    implementedBy: "pending",
    appliesTo: ["**/*.tsx", "**/*.ts"],
    note: "检测手写 `new Route({...})` 调用",
  },

  // ==================== B. TanStack Query ====================

  "mutation-invalidates": {
    severity: "error",
    mdSection: "#mutation-invalidates",
    implementedBy: "pending",
    appliesTo: ["**/*.tsx", "**/*.ts"],
    note: "检测 useMutation onSuccess 内调用 refetch() 但没调 invalidateQueries",
  },

  "querykey-via-factory": {
    severity: "warn",
    mdSection: "#querykey-via-factory",
    implementedBy: "pending",
    appliesTo: ["**/*.tsx", "**/*.ts"],
    note: '只在"跨文件复用"场景 error；单文件内使用放宽。Week 3-4 定阈值',
  },

  "explicit-staletime": {
    severity: "error",
    mdSection: "#explicit-staletime",
    implementedBy: "pending",
    appliesTo: ["**/*.tsx", "**/*.ts"],
    note: "检测 useQuery/useInfiniteQuery options 缺 staleTime",
  },

  // ==================== C. (已砍 2026-04-26) ====================
  // 3 条 workflow 规则(tanstack-doc-before-api / tanstack-search-unknown-api /
  // plan-lists-tanstack-refs)已被 tanstack-router / tanstack-query skill 覆盖
  // (实测 8/8 自动调用);plan-lists 依赖的 v2 orchestrator 也已砍。
  // `workflow` implementer 类型保留,留白给未来非代码规则(如 commit 规范)。

  // ==================== 2026-05-06 audit 砍 3 条 ====================
  // - route-nesting-by-data-dep  — 概念层,机器化困难,review 提醒即可
  // - long-list-use-infinitequery — 无法静态判断"列表多长"(原 note 自承)
  // - component-max-120-lines    — 魔数 120 来自 Airbnb,和团队无关,可能和"反过度抽象"冲突
  // 三条全删而非迁 workflow:workflow 提醒已由 CLAUDE.md 覆盖,不需要单独登记

  // ==================== D. Stack 通用 ====================

  "no-any": {
    severity: "error",
    mdSection: "#no-any",
    implementedBy: "oxlint-builtin",
    appliesTo: ["**/*.ts", "**/*.tsx"],
    note: "隐式 any 由 tsc strict(`noImplicitAny`)抓;显式 `:any` / `as any` 由 oxlint `typescript/no-explicit-any` 抓;`@ts-ignore` 由 `typescript/ban-ts-comment` 抓。三层互补(2026-05-06 配完,原 note 虚假)",
  },

  "at-alias-import": {
    severity: "warn",
    mdSection: "#at-alias-import",
    implementedBy: "oxlint-builtin",
    appliesTo: ["**/*.ts", "**/*.tsx"],
    note: "2026-05-22 改名:tilde-alias-import → at-alias-import,统一使用 @/(与 shadcn/Vite/tsconfig 对齐)。可由 Oxlint import/no-relative-parent-imports 近似覆盖,确认后改 builtin",
  },

  "theme-variables-for-colors": {
    severity: "warn",
    mdSection: "#theme-variables-for-colors",
    implementedBy: "pending",
    appliesTo: ["**/*.tsx", "**/*.css"],
    note: "observational(不实现):Tailwind v4 @theme + shadcn CSS vars 基本杜绝散色,等 pilot 真触发再补(2026-05-06 audit)",
  },

  "extend-shadcn-with-cn-cva": {
    severity: "warn",
    mdSection: "#extend-shadcn-with-cn-cva",
    implementedBy: "pending",
    appliesTo: ["**/components/**/*.tsx"],
    note: "检测 components/ui/* 文件被复制为 components/*（同名或近似名）",
  },

  "forwardref-has-displayname": {
    severity: "warn",
    mdSection: "#forwardref-has-displayname",
    implementedBy: "oxlint-plugin",
    appliesTo: ["**/*.tsx"],
    note: "React 19 ref-as-prop 让 forwardRef 退役中;shadcn/Radix 迁完前留 warn(2026-05-06 audit:error→warn)",
  },

  "async-errors-to-boundary": {
    severity: "warn",
    mdSection: "#async-errors-to-boundary",
    implementedBy: "workflow",
    appliesTo: ["**/*.tsx", "**/*.ts"],
    requiresType: true,
    note: "迁 workflow(2026-05-06 audit):要类型信息 + React 19 errorBoundary 模式变了,不适合 lint 层,在 review 层提醒",
  },

  "fetch-via-ofetch": {
    severity: "error",
    mdSection: "#fetch-via-ofetch",
    implementedBy: "oxlint-plugin",
    appliesTo: ["**/*.ts", "**/*.tsx"],
    note: "检测 fetch() 全局调用（排除 ofetch import 的场景）",
  },
};

/**
 * 快速统计当前注册表状态。用于 CI 健康检查和季度审查。
 */
export function summary() {
  const entries = Object.entries(rules);
  const byStatus = entries.reduce<Record<Implementer, number>>(
    (acc, [, meta]) => {
      acc[meta.implementedBy] = (acc[meta.implementedBy] ?? 0) + 1;
      return acc;
    },
    {} as Record<Implementer, number>,
  );

  const bySeverity = entries.reduce<Record<Severity, number>>(
    (acc, [, meta]) => {
      acc[meta.severity] = (acc[meta.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<Severity, number>,
  );

  const missingProvenance = entries.filter(([, m]) => !m.originFailure).map(([id]) => id);

  return {
    total: entries.length,
    byStatus,
    bySeverity,
    typeAwareCandidates: entries.filter(([, m]) => m.requiresType).map(([id]) => id),
    /**
     * 缺 originFailure 的规则（Week 3-4 起新加规则必须有，handoff §7.8）。
     * 初始 20 条视为继承 INITIAL_PROVENANCE，不在此列表。
     */
    missingProvenance,
  };
}
