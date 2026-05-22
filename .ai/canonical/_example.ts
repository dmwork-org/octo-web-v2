/**
 * 示例 canonical（**不是真实范本**）
 *
 * 命名 `_example.ts` 下划线前缀 = 约定的"非生产 / 仅展示格式"标记。
 * Week 1-2 起由陈超从 pilot 项目挑真实代码，填真实 `pinned_sha`，替换或补充本文件。
 *
 * 真实 canonical 必须满足（Week 1-2 验收标准）：
 *   1. `path` 指向 pilot 项目存在的真实 `.tsx` 文件
 *   2. `pinned_sha` 是真实 commit sha（40 字节 hex），不是占位 0
 *   3. `intent` 一句话说清楚演示了哪个品味（不是技术描述）
 *   4. `demonstrates` 里的 rule id 在 `.ai/taste/rules.ts` 存在
 */

import type { Canonical } from "./types";

const example: Canonical = {
  id: "_example-route-with-loader",
  path: "src/routes/posts.tsx",
  pinned_sha: "0000000000000000000000000000000000000000", // 占位，40 个 0 = freshness 脚本跳过
  intent: "用 loader 预取列表数据，不用 useEffect + fetch",
  tags: ["router", "query", "data-fetching"],
  tanstack_refs: ["router/createFileRoute", "router/loader", "query/ensureQueryData"],
  demonstrates: [
    "no-useeffect-fetch",
    "use-filebased-route",
    "route-error-component-required",
    "explicit-staletime",
  ],
};

export default example;
