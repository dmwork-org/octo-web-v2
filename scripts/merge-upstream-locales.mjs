#!/usr/bin/env node
/**
 * scripts/merge-upstream-locales.mjs
 *
 * 一次性把上游 b79eab8d 的 6 套 i18n locale 合并到新仓 src/lib/i18n/locales/。
 *
 * 上游各 package 用 prefix 区分 namespace,合并规则:
 *   apps/web              → web.*
 *   packages/dmworkbase   → base 已自带,跳过(本仓 instance.ts 已挂)
 *   packages/dmworkappbot → appbot.*
 *   packages/dmworkcontacts → contacts.*
 *   packages/dmworklogin  → login.*
 *   packages/dmworksummary → summary.*
 *   packages/dmworktodo   → matter.*
 *
 * 用法(在 project root):
 *   pnpm tsx scripts/merge-upstream-locales.mjs
 *   git diff src/lib/i18n/locales/
 *
 * 幂等:跑多次结果一致(读上游 → 跟新仓现有合并 → 覆盖写)。
 * upstream baseline = b79eab8d(docs/sync-log.md)。
 */
import fs from "node:fs";
import path from "node:path";

const UPSTREAM_CACHE = "/tmp/upstream-i18n";
const LOCALES_DIR = path.resolve("src/lib/i18n/locales");

const SOURCES = [
  { prefix: "appbot", src: "packages_dmworkappbot_src_i18n" },
  { prefix: "contacts", src: "packages_dmworkcontacts_src_i18n" },
  { prefix: "login", src: "packages_dmworklogin_src_i18n" },
  { prefix: "summary", src: "packages_dmworksummary_src_i18n" },
  { prefix: "matter", src: "packages_dmworktodo_src_i18n" },
  { prefix: "web", src: "apps_web_src_i18n" },
];

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v && typeof v === "object") {
      Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function mergeOne(locale) {
  const targetPath = path.join(LOCALES_DIR, `${locale}.json`);
  const target = loadJson(targetPath);
  for (const { prefix, src } of SOURCES) {
    const upPath = path.join(UPSTREAM_CACHE, `${src}_${locale}.json`);
    if (!fs.existsSync(upPath)) continue;
    const raw = loadJson(upPath);
    const flat = flatten(raw);
    for (const [k, v] of Object.entries(flat)) {
      target[`${prefix}.${k}`] = v;
    }
  }
  // 按 key 字典序写回(diff 友好)
  const sorted = Object.fromEntries(Object.entries(target).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(targetPath, `${JSON.stringify(sorted, null, 2)}\n`);
  return Object.keys(sorted).length;
}

const zhCount = mergeOne("zh-CN");
const enCount = mergeOne("en-US");
console.log(`merged: zh-CN=${zhCount} keys, en-US=${enCount} keys`);
