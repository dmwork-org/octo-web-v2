#!/usr/bin/env node
/**
 * scripts/taste-health.ts — 品味规则注册表健康检查
 *
 * 本脚本不 lint 代码，只检查 `.ai/taste/rules.ts` 当前注册状态。
 * 具体代码规则由 `vp check` 触发。
 */

import { rules, summary } from "../.ai/taste/rules";

function parseArgs(argv: string[]): void {
  for (const arg of argv) {
    if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    throw new Error(`unexpected file argument: ${arg}`);
  }
}

/** 打印规则注册表健康状况 */
function printSummary(): void {
  const s = summary();
  console.log("taste rules registry summary:");
  console.log(`  total: ${s.total}`);
  console.log("  by status:");
  for (const [status, count] of Object.entries(s.byStatus)) {
    console.log(`    ${status}: ${count}`);
  }
  console.log("  by severity:");
  for (const [sev, count] of Object.entries(s.bySeverity)) {
    console.log(`    ${sev}: ${count}`);
  }
  if (s.typeAwareCandidates.length > 0) {
    console.log(`  type-aware candidates: ${s.typeAwareCandidates.join(", ")}`);
  }

  const pluginRules = Object.entries(rules).filter(
    ([, meta]) => meta.implementedBy === "oxlint-plugin",
  );
  if (pluginRules.length > 0) {
    console.log(
      `  oxlint-plugin rules (loaded via vp check): ${pluginRules.map(([id]) => id).join(", ")}`,
    );
  }
}

async function main(): Promise<void> {
  parseArgs(process.argv.slice(2));
  printSummary();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
