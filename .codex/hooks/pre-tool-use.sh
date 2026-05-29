#!/bin/bash
# B21 — PreToolUse hook: 硬阻断(路径 + 内容双拦截)
#
# 触发: .claude/settings.json PreToolUse matcher=Write|Edit
# 输入: stdin JSON {session_id, tool_name, tool_input: {file_path, content?|old_string+new_string+replace_all}}
# 工作方式:
#   Write:
#     1. 跑 structure-lint --file 检 tool_input.file_path(路径级)
#     2. 写 tool_input.content 到 mktemp,跑 vp check(内容级,AST 基础)
#   Edit:
#     路径已存在不重校,只预览应用 old→new,写 temp,跑 vp check
#   任一失败 → permissionDecision:"deny" + 指令式 reason,工具不执行
#
# 兼容性:
#   - macOS / Linux mktemp 一致(用 mktemp -d)
#   - Edit preview 靠 node scripts/edit-preview.mjs(启动快,无 tsx 开销)
#
# 所有 deny 事件 append 到 .ai/traces/<date>/backlog-events.jsonl
# 所有真跑(通过 matcher+路径过滤)的 heartbeat append 到 .ai/traces/<date>/pre-tool-use.jsonl
#   —— 用来回答 "PreToolUse 到底跑没跑",静默成功不等于没跑

set -u

START_NS=$(date +%s%N 2>/dev/null || echo 0)

INPUT=$(cat)
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // "unknown"')
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0
[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

# 只关心 Write / Edit
case "$TOOL_NAME" in
  Write|Edit) ;;
  *) exit 0 ;;
esac

# 只关心 src/ 下的 .ts(x)
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
case "$FILE_PATH" in
  "$CLAUDE_PROJECT_DIR"/src/*) ;;
  *) exit 0 ;;
esac

# === 准备 temp 文件(放原文件同目录,以便相对 import + tsconfig include 正常)===
# 早期版本 K10 把 tmp 放 $CLAUDE_PROJECT_DIR/.tmp-hooks.XXX/,在 Edit 路径上会让 './foo' 这类
# 相对 import 解析失败(TS2307/TS2882),误伤合法文件。
# 实测发现 tsconfig.app.json `include: ["src"]` 默认跳过 `.` 开头隐藏文件,导致 vite-plus/client
# 的 *.css 模块声明注入不到隐藏 tmp,误报 TS2882。所以 tmp 用非 hidden 前缀,
# 同时在 vite.config.ts lint.ignorePatterns 里排除 *.preview-tmp.* 避免全项目扫描误抓残留。
FILE_DIR=$(dirname "$FILE_PATH")
FILE_BASE=$(basename "$FILE_PATH")
case "$FILE_PATH" in
  *.tsx) TMP_FILE="$FILE_DIR/${FILE_BASE%.tsx}.preview-tmp-$$-$RANDOM.tsx" ;;
  *)     TMP_FILE="$FILE_DIR/${FILE_BASE%.ts}.preview-tmp-$$-$RANDOM.ts"  ;;
esac
trap 'rm -f "$TMP_FILE"' EXIT

STRUCT_OUT=""
STRUCT_RC=0
STRUCT_MS=0
CONTENT_OUT=""
CONTENT_RC=0
CONTENT_MS=0
CHECKS="[]"

now_ns() { date +%s%N 2>/dev/null || echo 0; }

if [ "$TOOL_NAME" = "Write" ]; then
  # 1. 路径级
  T0=$(now_ns)
  STRUCT_OUT=$(pnpm exec tsx scripts/structure-lint.ts --file "$FILE_PATH" 2>&1)
  STRUCT_RC=$?
  STRUCT_MS=$(( ($(now_ns) - T0) / 1000000 ))

  # 2. 内容级
  printf '%s' "$INPUT" | jq -r '.tool_input.content // ""' > "$TMP_FILE"
  T0=$(now_ns)
  CONTENT_OUT=$(vp check --no-fmt -- "$TMP_FILE" 2>&1)
  CONTENT_RC=$?
  CONTENT_MS=$(( ($(now_ns) - T0) / 1000000 ))
  CHECKS='["structure-lint","vp-check"]'
else
  # Edit: 路径已存在不重校,只查应用 old→new 后的内容
  PREVIEW=$(printf '%s' "$INPUT" | jq -c '.tool_input' | node scripts/edit-preview.mjs 2>/dev/null)
  PREVIEW_RC=$?
  if [ "$PREVIEW_RC" -ne 0 ]; then
    # 预览失败(old_string 对不上)→ fail-open,让 Edit 工具自己报错
    exit 0
  fi
  printf '%s' "$PREVIEW" > "$TMP_FILE"
  T0=$(now_ns)
  CONTENT_OUT=$(vp check --no-fmt -- "$TMP_FILE" 2>&1)
  CONTENT_RC=$?
  CONTENT_MS=$(( ($(now_ns) - T0) / 1000000 ))
  CHECKS='["vp-check"]'
fi

# 全过 → allow
if [ "$STRUCT_RC" -eq 0 ] && [ "$CONTENT_RC" -eq 0 ]; then
  # heartbeat: 记录这次 Pre 执行了且放行
  HEARTBEAT_DIR="$CLAUDE_PROJECT_DIR/.ai/traces/$(date +%F)"
  mkdir -p "$HEARTBEAT_DIR"
  DUR_MS=$(( ($(now_ns) - START_NS) / 1000000 ))
  jq -nc \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg session "$SESSION_ID" \
    --arg tool "$TOOL_NAME" \
    --arg file "$FILE_PATH" \
    --arg decision "allow" \
    --argjson checks "$CHECKS" \
    --argjson duration_ms "$DUR_MS" \
    --argjson struct_ms "$STRUCT_MS" \
    --argjson content_ms "$CONTENT_MS" \
    '{ts: $ts, session: $session, tool: $tool, file: $file, decision: $decision, checks: $checks, rules: [], duration_ms: $duration_ms, struct_ms: $struct_ms, content_ms: $content_ms}' \
    >> "$HEARTBEAT_DIR/pre-tool-use.jsonl"
  exit 0
fi

# === 失败: 提规则 + append backlog event + emit deny ===
STRUCT_RULES=$(printf '%s' "$STRUCT_OUT" | grep -oE '\[[a-z-]+\]' | sed 's/^\[//; s/\]$//' | sort -u | jq -R . | jq -sc .)
CONTENT_RULES=$(printf '%s' "$CONTENT_OUT" | grep -oE 'taste\([a-z0-9-]+\)' | sed 's/^taste(//; s/)$//' | sort -u | jq -R . | jq -sc .)
[ -z "$STRUCT_RULES" ] && STRUCT_RULES='[]'
[ -z "$CONTENT_RULES" ] && CONTENT_RULES='[]'
ALL_RULES=$(jq -n --argjson a "$STRUCT_RULES" --argjson b "$CONTENT_RULES" '$a + $b | unique')
RULES_COMMA=$(printf '%s' "$ALL_RULES" | jq -r 'join(", ")')
[ -z "$RULES_COMMA" ] && RULES_COMMA="(other: typecheck / lint)"

EVENTS_DIR="$CLAUDE_PROJECT_DIR/.ai/traces/$(date +%F)"
mkdir -p "$EVENTS_DIR"
jq -nc \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg file "$FILE_PATH" \
  --arg category "pre-tool-use" \
  --argjson rules "$ALL_RULES" \
  --arg excerpt "$(printf '%s\n%s' "$STRUCT_OUT" "$CONTENT_OUT" | head -c 400 | tr '\n' ' ')" \
  '{ts: $ts, session: $session, tool: $tool, file: $file, category: $category, rules: $rules, reason_excerpt: $excerpt}' \
  >> "$EVENTS_DIR/backlog-events.jsonl"

# heartbeat: 记录这次 Pre 执行了且 deny
DUR_MS=$(( ($(now_ns) - START_NS) / 1000000 ))
jq -nc \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg file "$FILE_PATH" \
  --arg decision "deny" \
  --argjson checks "$CHECKS" \
  --argjson rules "$ALL_RULES" \
  --argjson duration_ms "$DUR_MS" \
  --argjson struct_ms "$STRUCT_MS" \
  --argjson content_ms "$CONTENT_MS" \
  '{ts: $ts, session: $session, tool: $tool, file: $file, decision: $decision, checks: $checks, rules: $rules, duration_ms: $duration_ms, struct_ms: $struct_ms, content_ms: $content_ms}' \
  >> "$EVENTS_DIR/pre-tool-use.jsonl"

REL_PATH="${FILE_PATH#$CLAUDE_PROJECT_DIR/}"
DETAILS=""
if [ "$STRUCT_RC" -ne 0 ]; then
  DETAILS+="[path violations]
$STRUCT_OUT

"
fi
if [ "$CONTENT_RC" -ne 0 ]; then
  # 把 temp 路径替换回目标路径,不暴露 temp 细节
  CLEAN_CONTENT_OUT=$(printf '%s' "$CONTENT_OUT" | sed "s|$TMP_FILE|$REL_PATH|g")
  DETAILS+="[content violations]
$CLEAN_CONTENT_OUT
"
fi

REASON=$(cat <<EOF
🛑 BLOCKED by pre-tool-use ($TOOL_NAME)
FILE:  $REL_PATH
RULES: $RULES_COMMA
FIX:   按下面 DETAILS 修正,然后重新 $TOOL_NAME 相同文件(不要换 MultiEdit / 换文件名绕过)

DETAILS:
$DETAILS
参考: CLAUDE.md §目录规范 + .ai/taste/rules.ts
EOF
)

jq -n \
  --arg reason "$REASON" \
  '{
     hookSpecificOutput: {
       hookEventName: "PreToolUse",
       permissionDecision: "deny",
       permissionDecisionReason: $reason
     }
   }'
exit 0
