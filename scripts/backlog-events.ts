#!/usr/bin/env tsx
/**
 * backlog-events — 读 .ai/traces/<date>/backlog-events.jsonl,按 rule 聚合 count
 *
 * 作用:
 *   - 把 hook 抓的 block 事件汇总成 "规则触发频次",给 ingest-failure 的 N≥2 阈值喂真实数据
 *   - 替代 backlog.md 里手填 count=N 的 placeholder
 *
 * Event category 语义(重要):
 *   pre-tool-use          🟢 PreToolUse 硬阻断 — 违规没写进来。攻击成功
 *   post-tool-use-leak    🚨 Pre 漏了,Post 才抓到 — 系统漏洞,立即看日志
 *   vp-check / structure-lint  📦 Pre/Post 拆分前的旧事件(不会再产生)
 *
 * Event schema:
 *   {ts, session, tool, file, category, rules[], reason_excerpt}
 *
 * CLI:
 *   tsx scripts/backlog-events.ts             # 分层人可读
 *   tsx scripts/backlog-events.ts --json      # 机器可读
 *   tsx scripts/backlog-events.ts --since 7   # 只看近 7 天
 *   tsx scripts/backlog-events.ts <rootDir>
 *
 * 退出码:永远 0(查询工具,不是 linter)
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

type Event = {
  ts: string;
  session: string;
  tool: string;
  file: string;
  category: string;
  rules: string[];
  reason_excerpt?: string;
};

type Heartbeat = {
  ts: string;
  session: string;
  tool: string;
  file: string;
  decision: "allow" | "deny";
  checks?: string[];
  rules: string[];
  duration_ms: number;
  struct_ms?: number;
  content_ms?: number;
};

const PRE_CATEGORY = "pre-tool-use";
const LEAK_CATEGORY = "post-tool-use-leak";
const LEGACY_CATEGORIES = new Set(["vp-check", "structure-lint"]);

export function loadHeartbeats(rootDir: string, sinceDays?: number): Heartbeat[] {
  const tracesDir = join(rootDir, ".ai", "traces");
  if (!existsSync(tracesDir)) return [];
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400 * 1000 : 0;
  const out: Heartbeat[] = [];
  for (const date of readdirSync(tracesDir)) {
    const dayDir = join(tracesDir, date);
    if (!statSync(dayDir).isDirectory()) continue;
    const file = join(dayDir, "pre-tool-use.jsonl");
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const hb = JSON.parse(trimmed) as Heartbeat;
        if (cutoff > 0 && new Date(hb.ts).getTime() < cutoff) continue;
        out.push(hb);
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}

export function loadEvents(rootDir: string, sinceDays?: number): Event[] {
  const tracesDir = join(rootDir, ".ai", "traces");
  if (!existsSync(tracesDir)) return [];
  const cutoff = sinceDays ? Date.now() - sinceDays * 86400 * 1000 : 0;
  const events: Event[] = [];
  for (const date of readdirSync(tracesDir)) {
    const dayDir = join(tracesDir, date);
    if (!statSync(dayDir).isDirectory()) continue;
    const file = join(dayDir, "backlog-events.jsonl");
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed) as Event;
        if (cutoff > 0 && new Date(ev.ts).getTime() < cutoff) continue;
        events.push(ev);
      } catch {
        /* skip malformed */
      }
    }
  }
  return events;
}

export type RuleAgg = {
  rule: string;
  count: number;
  files: Set<string>;
  sessions: Set<string>;
  firstSeen: string;
  lastSeen: string;
  categories: Set<string>;
};

export function aggregateByRule(events: Event[]): RuleAgg[] {
  const map = new Map<string, RuleAgg>();
  for (const e of events) {
    for (const rule of e.rules ?? []) {
      let agg = map.get(rule);
      if (!agg) {
        agg = {
          rule,
          count: 0,
          files: new Set(),
          sessions: new Set(),
          firstSeen: e.ts,
          lastSeen: e.ts,
          categories: new Set(),
        };
        map.set(rule, agg);
      }
      agg.count += 1;
      agg.files.add(e.file);
      agg.sessions.add(e.session);
      agg.categories.add(e.category);
      if (e.ts < agg.firstSeen) agg.firstSeen = e.ts;
      if (e.ts > agg.lastSeen) agg.lastSeen = e.ts;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function rel(rootDir: string, abs: string): string {
  return abs.startsWith(rootDir + "/") ? abs.slice(rootDir.length + 1) : abs;
}

function printHuman(events: Event[], heartbeats: Heartbeat[], rootDir: string): void {
  // --- 📈 Heartbeat(Pre 到底跑没跑)---
  if (heartbeats.length > 0) {
    const allow = heartbeats.filter((h) => h.decision === "allow").length;
    const deny = heartbeats.filter((h) => h.decision === "deny").length;
    const last = heartbeats[heartbeats.length - 1]!;
    console.log(
      `📈 pre fired: ${heartbeats.length}  allow=${allow}  deny=${deny}  last=${last.ts.slice(0, 19)}`,
    );

    // 分 modern(带 checks[] 字段)/ legacy(旧 hook 写的,无分步数据)
    const modern = heartbeats.filter((h) => Array.isArray(h.checks));
    const legacy = heartbeats.length - modern.length;

    if (modern.length === 0) {
      const avgAll = Math.round(
        heartbeats.reduce((s, h) => s + (h.duration_ms || 0), 0) / heartbeats.length,
      );
      console.log(
        `   duration avg=${avgAll}ms  (全 ${heartbeats.length} 条为 legacy 格式,无分步 — 新 Write/Edit 后会出现 breakdown)\n`,
      );
    } else {
      const modAvg = Math.round(
        modern.reduce((s, h) => s + (h.duration_ms || 0), 0) / modern.length,
      );
      // 按 check 分组统计运行次数 + 平均耗时
      const structRuns = modern.filter((h) => (h.checks ?? []).includes("structure-lint"));
      const vpRuns = modern.filter((h) => (h.checks ?? []).includes("vp-check"));
      const fmtAvg = (arr: Heartbeat[], key: "struct_ms" | "content_ms") =>
        arr.length ? Math.round(arr.reduce((s, h) => s + (h[key] || 0), 0) / arr.length) : 0;
      const structAvg = fmtAvg(structRuns, "struct_ms");
      const vpAvg = fmtAvg(vpRuns, "content_ms");
      // overhead = duration - (struct + content);每条单独算再平均
      const ohAvg = Math.round(
        modern.reduce((s, h) => {
          const checkSum = (h.struct_ms || 0) + (h.content_ms || 0);
          return s + Math.max(0, (h.duration_ms || 0) - checkSum);
        }, 0) / modern.length,
      );

      console.log(
        `   modern ${modern.length} 条  avg=${modAvg}ms${legacy ? `  (legacy ${legacy} 条未计入 breakdown)` : ""}`,
      );
      console.log(
        `   breakdown: structure-lint ${structRuns.length}次/avg=${structAvg}ms   vp-check ${vpRuns.length}次/avg=${vpAvg}ms   overhead avg=${ohAvg}ms\n`,
      );
    }
  } else {
    console.log(
      "📈 pre fired: 0(PreToolUse 没跑过 — 检查 settings.json hook 注册 / CLAUDE_PROJECT_DIR)\n",
    );
  }

  if (events.length === 0) {
    console.log("📭 no backlog events yet");
    console.log("   (hook 没捕获过 block;跑一个违规的 Write/Edit 让 CC 触发)");
    return;
  }

  const preEvents = events.filter((e) => e.category === PRE_CATEGORY);
  const leakEvents = events.filter((e) => e.category === LEAK_CATEGORY);
  const legacyEvents = events.filter((e) => LEGACY_CATEGORIES.has(e.category));
  const unknownEvents = events.filter(
    (e) =>
      e.category !== PRE_CATEGORY &&
      e.category !== LEAK_CATEGORY &&
      !LEGACY_CATEGORIES.has(e.category),
  );

  console.log(
    `📊 total=${events.length}  pre=${preEvents.length}  leak=${leakEvents.length}  legacy=${legacyEvents.length}${unknownEvents.length ? `  unknown=${unknownEvents.length}` : ""}\n`,
  );

  // --- 🚨 LEAKS(优先显示,raw 事件,每条都要看)---
  if (leakEvents.length > 0) {
    console.log("🚨 LEAKS — Pre 漏了,Post 才抓到(系统漏洞,立即查)\n");
    for (const e of leakEvents) {
      console.log(`   ${e.ts.slice(0, 19)}  ${e.tool}  ${rel(rootDir, e.file)}`);
      console.log(`      rules: ${e.rules.join(", ")}   session: ${e.session.slice(0, 8)}`);
    }
    console.log("");
  } else {
    console.log("🚨 LEAKS: 0(好)\n");
  }

  // --- 🟢 Attempts Caught by Pre(聚合,count≥2 打 🎯)---
  const preAgg = aggregateByRule(preEvents);
  if (preAgg.length > 0) {
    console.log("🟢 ATTEMPTS CAUGHT by PreToolUse — CC 被挡在门外的违规尝试\n");
    for (const a of preAgg) {
      const marker = a.count >= 2 ? "🎯" : "  ";
      console.log(
        `${marker} ${a.rule.padEnd(30)} count=${a.count}  files=${a.files.size}  sessions=${a.sessions.size}`,
      );
      console.log(`     first=${a.firstSeen.slice(0, 19)}  last=${a.lastSeen.slice(0, 19)}`);
    }
    console.log("\n   🎯 = count≥2,已达 ingest-failure 晋升阈值");
    console.log("");
  } else if (events.length > 0) {
    console.log("🟢 ATTEMPTS CAUGHT: 0(CC 没撞过 Pre 硬门)\n");
  }

  // --- 📦 Legacy(Pre/Post 拆分前的旧事件)---
  if (legacyEvents.length > 0) {
    const legAgg = aggregateByRule(legacyEvents);
    console.log(`📦 LEGACY(Pre/Post 拆分前,${legacyEvents.length} 条)\n`);
    for (const a of legAgg.slice(0, 5)) {
      console.log(
        `   ${a.rule.padEnd(30)} count=${a.count}  [${Array.from(a.categories).join(",")}]`,
      );
    }
    if (legAgg.length > 5) console.log(`   ... +${legAgg.length - 5} more legacy rules`);
    console.log("");
  }

  if (unknownEvents.length > 0) {
    console.log(`⚠️  ${unknownEvents.length} events 带未知 category — 查 jsonl 是否有 hook 写错`);
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes("--json");
  let sinceDays: number | undefined;
  const sinceIdx = argv.indexOf("--since");
  if (sinceIdx !== -1) {
    const v = argv[sinceIdx + 1];
    if (v) sinceDays = Number(v);
  }
  const posArgs = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--since");
  const rootDir = posArgs[0] ?? process.cwd();

  const events = loadEvents(rootDir, sinceDays);
  const heartbeats = loadHeartbeats(rootDir, sinceDays);

  if (jsonMode) {
    const preEvents = events.filter((e) => e.category === PRE_CATEGORY);
    const leakEvents = events.filter((e) => e.category === LEAK_CATEGORY);
    const legacyEvents = events.filter((e) => LEGACY_CATEGORIES.has(e.category));
    const allow = heartbeats.filter((h) => h.decision === "allow").length;
    const deny = heartbeats.filter((h) => h.decision === "deny").length;
    const avgDur = heartbeats.length
      ? Math.round(heartbeats.reduce((s, h) => s + (h.duration_ms || 0), 0) / heartbeats.length)
      : 0;
    const aggMap = (arr: Event[]) =>
      aggregateByRule(arr).map((a) => ({
        rule: a.rule,
        count: a.count,
        files: Array.from(a.files),
        sessions: Array.from(a.sessions),
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
        categories: Array.from(a.categories),
      }));
    console.log(
      JSON.stringify(
        {
          total: events.length,
          counts: {
            pre: preEvents.length,
            leak: leakEvents.length,
            legacy: legacyEvents.length,
          },
          heartbeat: {
            total: heartbeats.length,
            allow,
            deny,
            avg_duration_ms: avgDur,
            last_ts: heartbeats.length ? heartbeats[heartbeats.length - 1]!.ts : null,
          },
          leaks: leakEvents,
          pre: aggMap(preEvents),
          legacy: aggMap(legacyEvents),
        },
        null,
        2,
      ),
    );
  } else {
    printHuman(events, heartbeats, rootDir);
  }
  process.exit(0);
}

main();
