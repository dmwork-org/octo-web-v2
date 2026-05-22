#!/usr/bin/env tsx
/**
 * structure-lint v1 — 机器检目录 / 文件名 / 后缀约定
 *
 * 对应 CLAUDE.md 的目录规范 + src/features/README.md 的后缀约定。
 *
 * Rules:
 *   [kebab-case]              src 下所有 .ts(x) basename 必须 kebab-case
 *                             (TanStack 前缀 __ / _ / $ / - 允许;.gen.ts(x) 豁免)
 *   [subdir-suffix]           src/features/FEAT/KIND/ 下文件必须带对应后缀
 *                             queries → .query.ts   mutations → .mutation.ts
 *                             api → .api.ts         schemas → .schema.ts
 *                             types → .types.ts     hooks → .hook.ts(x)
 *                             views → .view.tsx     forms → .form.tsx
 *   [manifest-required]       每个 src/features/FEAT/ 必须有 MANIFEST.md (仅全扫模式)
 *   [components-only-ui]      src/components 下只允许 ui/ + README.md
 *   [no-index-outside-routes] src 下除 routes 外禁止 index.ts(x)
 *
 * 生成物豁免(工具无关):
 *   读 package.json 的 `harness.generatedDirs: string[]`(相对 rootDir 的 glob-like 前缀),
 *   匹中的整个子树跳过所有规则。换 codegen 工具(yapi / swagger / orval / hey-api ...)
 *   只需在 package.json 加路径,structure-lint 本身零改动。
 *
 * CLI:
 *   tsx scripts/structure-lint.ts                       # 全扫 cwd
 *   tsx scripts/structure-lint.ts <rootDir>             # 全扫指定 rootDir
 *   tsx scripts/structure-lint.ts --file <absPath>      # 单文件模式 (hook 用)
 *
 * 退出码:0 = 合规;1 = 有违规
 */

import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, relative, basename, sep, isAbsolute, resolve } from "node:path";

type Issue = { rule: string; file: string; reason: string };

const SUBDIR_SUFFIX: Record<string, string[]> = {
  api: [".api.ts"],
  schemas: [".schema.ts"],
  types: [".types.ts"],
  queries: [".query.ts", ".keys.ts"],
  mutations: [".mutation.ts"],
  hooks: [".hook.ts", ".hook.tsx"],
  views: [".view.tsx"],
  forms: [".form.tsx"],
};

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * 读 package.json 的 `harness.generatedDirs`(相对 rootDir 的目录前缀清单)。
 * 匹中的文件整体豁免(所有规则),manifest-required 对生成物所在 feature 不豁免。
 */
function loadGeneratedDirs(rootDir: string): string[] {
  const pkgPath = join(rootDir, "package.json");
  if (!existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      harness?: { generatedDirs?: unknown };
    };
    const raw = pkg.harness?.generatedDirs;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

function isInGeneratedDir(file: string, rootDir: string, generatedDirs: string[]): boolean {
  if (generatedDirs.length === 0) return false;
  const rel = relative(rootDir, file);
  for (const g of generatedDirs) {
    const norm = g.replace(/\/+$/, "");
    if (rel === norm || rel.startsWith(norm + sep)) return true;
  }
  return false;
}

/**
 * 判定 basename 是否合法:
 * - .gen.ts(x) 豁免
 * - TanStack 前缀 __ / _ / $ / - 后允许 kebab 或 camelCase($paramName 用)
 * - 否则严格 kebab-case
 */
function isKebab(name: string): boolean {
  if (name.endsWith(".gen.ts") || name.endsWith(".gen.tsx")) return true;
  const prefixMatch = name.match(/^(__|_|\$|-)(.+)$/);
  if (prefixMatch) {
    const rest = prefixMatch[2] ?? "";
    return /^([a-z0-9]+(-[a-z0-9]+)*|[a-zA-Z][a-zA-Z0-9]*)(\.[a-z0-9]+)+$/.test(rest);
  }
  return /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)+$/.test(name);
}

function checkKebabCase(file: string, rootDir: string, issues: Issue[]): void {
  const base = basename(file);
  if (!isKebab(base)) {
    issues.push({
      rule: "kebab-case",
      file: relative(rootDir, file),
      reason: `filename '${base}' 不是 kebab-case(TanStack 前缀 __/_/$/- 允许;.gen.ts(x) 豁免)`,
    });
  }
}

function checkSubdirSuffix(file: string, srcDir: string, rootDir: string, issues: Issue[]): void {
  const rel = relative(srcDir, file);
  const parts = rel.split(sep);
  if (parts[0] !== "features" || parts.length < 4) return;
  const kind = parts[2];
  if (!kind) return;
  const expected = SUBDIR_SUFFIX[kind];
  if (!expected) return;
  const base = basename(file);
  if (!expected.some((sfx) => base.endsWith(sfx))) {
    issues.push({
      rule: "subdir-suffix",
      file: relative(rootDir, file),
      reason: `${kind}/ 下文件必须以 ${expected.join(" 或 ")} 结尾`,
    });
  }
}

function checkNoIndexOutsideRoutes(
  file: string,
  srcDir: string,
  rootDir: string,
  issues: Issue[],
): void {
  const base = basename(file);
  if (base !== "index.ts" && base !== "index.tsx") return;
  const rel = relative(srcDir, file);
  if (rel.startsWith("routes" + sep) || rel === `routes${sep}index.tsx`) return;
  issues.push({
    rule: "no-index-outside-routes",
    file: relative(rootDir, file),
    reason: `src/ 下除 routes/ 外禁止 index.ts(x),用语义后缀(.view.tsx / .query.ts / ...)`,
  });
}

function checkComponentsOnlyUi(
  file: string,
  srcDir: string,
  rootDir: string,
  issues: Issue[],
): void {
  const rel = relative(srcDir, file);
  const parts = rel.split(sep);
  if (parts[0] !== "components") return;
  if (parts.length < 2) return;
  // 允许:components/ui/** + components/README.md
  if (parts[1] === "ui") return;
  if (parts.length === 2 && parts[1] === "README.md") return;
  issues.push({
    rule: "components-only-ui",
    file: relative(rootDir, file),
    reason: `src/components/ 下只允许 ui/ + README.md,'${parts.slice(1).join(sep)}' 违规`,
  });
}

function checkManifestRequired(srcDir: string, rootDir: string, issues: Issue[]): void {
  const featuresDir = join(srcDir, "features");
  if (!existsSync(featuresDir)) return;
  for (const entry of readdirSync(featuresDir)) {
    if (entry.startsWith("_") || entry.startsWith(".")) continue;
    const full = join(featuresDir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (!existsSync(join(full, "MANIFEST.md"))) {
      issues.push({
        rule: "manifest-required",
        file: relative(rootDir, full),
        reason: `feature '${entry}' 缺 MANIFEST.md(src/features/README.md 有模板)`,
      });
    }
  }
}

function checkComponentsDirLevel(srcDir: string, rootDir: string, issues: Issue[]): void {
  const componentsDir = join(srcDir, "components");
  if (!existsSync(componentsDir)) return;
  for (const entry of readdirSync(componentsDir)) {
    const full = join(componentsDir, entry);
    const isDir = statSync(full).isDirectory();
    if (isDir && entry !== "ui") {
      issues.push({
        rule: "components-only-ui",
        file: relative(rootDir, full),
        reason: `components/ 下只允许 ui/ 子目录,'${entry}/' 违规`,
      });
    }
    if (!isDir && entry !== "README.md") {
      issues.push({
        rule: "components-only-ui",
        file: relative(rootDir, full),
        reason: `components/ 下只允许 ui/ 和 README.md,文件 '${entry}' 违规`,
      });
    }
  }
}

export function checkAll(rootDir: string): Issue[] {
  const issues: Issue[] = [];
  const srcDir = join(rootDir, "src");
  if (!existsSync(srcDir)) return issues;

  const generatedDirs = loadGeneratedDirs(rootDir);
  const tsFiles = walk(srcDir)
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !isInGeneratedDir(f, rootDir, generatedDirs));

  for (const f of tsFiles) {
    checkKebabCase(f, rootDir, issues);
    checkSubdirSuffix(f, srcDir, rootDir, issues);
    checkNoIndexOutsideRoutes(f, srcDir, rootDir, issues);
    checkComponentsOnlyUi(f, srcDir, rootDir, issues);
  }

  checkManifestRequired(srcDir, rootDir, issues);
  checkComponentsDirLevel(srcDir, rootDir, issues);

  return issues;
}

export function checkSingleFile(filePath: string, rootDir: string): Issue[] {
  const issues: Issue[] = [];
  const srcDir = join(rootDir, "src");
  const abs = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
  // 只对 src/ 下的 .ts(x) 检(PreToolUse 阶段文件可能尚未存在,不做 existsSync 守卫)
  if (!abs.startsWith(srcDir + sep)) return issues;
  if (!/\.tsx?$/.test(abs)) return issues;

  // 生成物豁免(写入一刻就跳过,PreToolUse 不卡 codegen)
  const generatedDirs = loadGeneratedDirs(rootDir);
  if (isInGeneratedDir(abs, rootDir, generatedDirs)) return issues;

  checkKebabCase(abs, rootDir, issues);
  checkSubdirSuffix(abs, srcDir, rootDir, issues);
  checkNoIndexOutsideRoutes(abs, srcDir, rootDir, issues);
  checkComponentsOnlyUi(abs, srcDir, rootDir, issues);
  // MANIFEST / components-dir-level 是目录级,单文件模式跳过

  return issues;
}

function printAndExit(issues: Issue[]): never {
  if (issues.length === 0) {
    console.log("🟢 structure-lint: 目录结构合规");
    process.exit(0);
  }
  console.log(`🔴 structure-lint: 发现 ${issues.length} 条违规\n`);
  for (const i of issues) {
    console.log(`  [${i.rule}] ${i.file}`);
    console.log(`    ${i.reason}`);
  }
  process.exit(1);
}

function main(): void {
  const argv = process.argv.slice(2);
  const fileFlagIdx = argv.indexOf("--file");

  if (fileFlagIdx !== -1) {
    const filePath = argv[fileFlagIdx + 1];
    if (!filePath) {
      console.error("usage: --file <path>");
      process.exit(2);
    }
    const rootDir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
    printAndExit(checkSingleFile(filePath, rootDir));
  }

  const rootDir = argv[0] ?? process.cwd();
  printAndExit(checkAll(rootDir));
}

main();
