#!/usr/bin/env node
/**
 * scripts/taste-lint.ts — 品味规则检查入口
 *
 * 和 vp check 的分工（handoff §7.1）:
 *   1. vp check --fix        Oxlint 内置 + Oxfmt + tsc，覆盖通用规则
 *   2. taste-lint.ts         团队品味规则（本脚本）
 *
 * 本脚本做两件事（handoff §4.1 三段式）:
 *   - primary: Oxlint JS Plugin 路径 — 通过 .oxlintrc.json 的 jsPlugins 加载
 *              本脚本**不直接 lint**，只是 vp check 的健康检查（规则注册状态校验）
 *   - fallback: ts-morph 逃生口 — 对 requiresType=true 的规则，跑 type-aware 检查
 *
 * Week 0: 只 scaffold 结构。Oxlint JS Plugin 实现和 ts-morph 规则都 TODO 到 Week 3-4。
 */

import { rules, summary } from "../.ai/taste/rules";
import type { RuleMeta } from "../.ai/taste/rules";

interface CliArgs {
  /** 仅运行 type-aware 规则（走 ts-morph 逃生口） */
  typeAware: boolean;
  /** 打印规则注册表健康状况 */
  summary: boolean;
  /** 文件 glob，空表示全仓 */
  files: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { typeAware: false, summary: false, files: [] };
  for (const arg of argv) {
    if (arg === "--type-aware") args.typeAware = true;
    else if (arg === "--summary") args.summary = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else args.files.push(arg);
  }
  return args;
}

// ==================== 三段式分发 ====================

function isTypeAwareRule([, meta]: [string, RuleMeta]): boolean {
  return meta.implementedBy === "ts-morph" || meta.requiresType === true;
}

function isPluginRule([, meta]: [string, RuleMeta]): boolean {
  return meta.implementedBy === "oxlint-plugin";
}

/** 对 ts-morph 逃生口，跑 type-aware 规则 */
async function runTypeAware(_files: string[]): Promise<{
  errors: number;
  warnings: number;
}> {
  const typeAwareRules = Object.entries(rules).filter(isTypeAwareRule);
  console.log(`type-aware rules: ${typeAwareRules.map(([id]) => id).join(", ")}`);

  // TODO(week-3-4):
  // 1. 初始化 ts-morph Project
  // 2. 对每条 type-aware 规则，dispatch 到 .ai/taste/type-aware-rules/{id}.ts
  //    里的 check(sourceFile, typeChecker) 函数
  // 3. 汇总 diagnostics，按 severity 分类输出

  return { errors: 0, warnings: 0 };
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

  const pluginRules = Object.entries(rules).filter(isPluginRule);
  if (pluginRules.length > 0) {
    console.log(
      `  oxlint-plugin rules (loaded via .oxlintrc.json): ${pluginRules
        .map(([id]) => id)
        .join(", ")}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.summary) {
    printSummary();
    return;
  }

  if (args.typeAware) {
    const { errors, warnings } = await runTypeAware(args.files);
    console.log(`type-aware: ${errors} errors, ${warnings} warnings`);
    if (errors > 0) process.exit(1);
    return;
  }

  // 默认什么都不做：Oxlint 规则通过 vp check 触发，不走本脚本
  console.log(
    "taste-lint.ts: Oxlint JS Plugin 规则由 `vp check` 触发（.oxlintrc.json 配置）。\n" +
      "               本脚本仅负责 type-aware 规则 (--type-aware) 和注册表概览 (--summary)。",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
