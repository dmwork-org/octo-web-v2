/**
 * Canonical 指针的类型定义
 *
 * 每个 canonical 文件 default export 一个 Canonical 对象。
 * 推荐用 `satisfies Canonical`（保类型安全 + 保留字面量类型）而不是 `: Canonical`。
 *
 * 字段增减视为 schema 变更，需要在 docs/handoff.md §13.2 Phase 3 协议下走 major bump。
 */

export interface Canonical {
  /** 和文件名一致，kebab-case，意图驱动（§5 "canonical 命名要意图驱动"） */
  id: string;

  /** 指向 pilot 项目根目录的相对路径，例如 `src/routes/posts.tsx` */
  path: string;

  /**
   * 锁到具体 commit sha。
   * - 防止指针指向的代码被改烂了 harness 不知情
   * - 未来 `scripts/canonical-freshness.ts`（Week 3-4）检查 pinned_sha 对应文件 vs 当前文件
   * - 示例占位值约定：40 个 0（`'0000000000000000000000000000000000000000'`），freshness 脚本跳过占位值
   */
  pinned_sha: string;

  /** 一句话说明这个范本在演示什么品味 */
  intent: string;

  /** 检索 / 分类标签，例如 `['router', 'query', 'data-fetching']` */
  tags: string[];

  /**
   * 涉及的 TanStack API 路径。
   * 格式 `<package>/<api>`，例如 `router/loader` / `query/ensureQueryData`。
   * Week 3-4 `tanstack-doc-before-api` 规则消费本字段。
   */
  tanstack_refs?: string[];

  /**
   * 本 canonical 演示"如何符合"的 taste rule id 列表。
   * 用于反向索引：打开某条规则 → 自动找到演示该规则的 canonical。
   * 值必须是 `.ai/taste/rules.ts` 里存在的 id。
   */
  demonstrates?: string[];
}
