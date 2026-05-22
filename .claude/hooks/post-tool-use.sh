#!/bin/bash
# B7 — PostToolUse hook: trace + leak 兜底(PreToolUse 已硬阻断,此处补漏)
#
# 触发: .claude/settings.json PostToolUse matcher=Write|Edit
# 工作方式:
#   vp check 实际已落盘的文件(事后):
#     过 → 静默 exit 0
#     失败 → 理论上不该发生(PreToolUse 应拦下);发生了说明有漏网
#           a) append JSONL category:"post-tool-use-leak"(告警信号)
#           b) emit decision:block 软反馈(即使软也比啥没有强,CC 下轮看到提示)
#
# 正常链路下此 hook 会 exit 0 无声,只在 Pre 漏网 / MultiEdit 等未拦截路径时触发

set -u

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"')
TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // "unknown"')
[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

case "$FILE_PATH" in
  "$CLAUDE_PROJECT_DIR"/src/*) ;;
  *) exit 0 ;;
esac

OUTPUT=$(vp check --no-fmt -- -c "$CLAUDE_PROJECT_DIR/.oxlintrc.json" "$FILE_PATH" 2>&1)
RC=$?

if [ "$RC" -eq 0 ]; then
  exit 0
fi

# 漏网:append 带 "leak" 标记的 event
RULES_ARR=$(printf '%s' "$OUTPUT" | grep -oE 'taste\([a-z0-9-]+\)' | sed 's/^taste(//; s/)$//' | sort -u | jq -R . | jq -sc .)
[ -z "$RULES_ARR" ] && RULES_ARR='[]'

EVENTS_DIR="$CLAUDE_PROJECT_DIR/.ai/traces/$(date +%F)"
mkdir -p "$EVENTS_DIR"
jq -nc \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg session "$SESSION_ID" \
  --arg tool "$TOOL_NAME" \
  --arg file "$FILE_PATH" \
  --arg category "post-tool-use-leak" \
  --argjson rules "$RULES_ARR" \
  --arg excerpt "$(printf '%s' "$OUTPUT" | head -c 400 | tr '\n' ' ')" \
  '{ts: $ts, session: $session, tool: $tool, file: $file, category: $category, rules: $rules, reason_excerpt: $excerpt}' \
  >> "$EVENTS_DIR/backlog-events.jsonl"

REL_PATH="${FILE_PATH#$CLAUDE_PROJECT_DIR/}"
jq -n \
  --arg file "$REL_PATH" \
  --arg out "$OUTPUT" \
  '{
     decision: "block",
     reason: ("⚠️  LEAKED through PreToolUse — 内容 lint 失败 on " + $file + " (代码已落盘;请按下列修正重写文件)\n" + $out),
     hookSpecificOutput: {
       hookEventName: "PostToolUse",
       additionalContext: "PreToolUse 应该拦下此类错误;持续出现说明 hook 有 bug,查 .ai/traces/<date>/backlog-events.jsonl 的 post-tool-use-leak 事件"
     }
   }'
exit 0
