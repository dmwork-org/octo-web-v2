#!/bin/bash
# B8 — Stop hook: 会话结束跑健康检查
#
# 触发: .claude/settings.json Stop 事件
# 动作:
#   - wiki-lint: 三角一致性 (orphan rules / orphan evals)
#   - harness-health: 聚合 trace → markdown 报告落盘
#   - 跳过 run-evals (太重, 每次 session 跑 18 evals 不合理;evals 走 CI/手动)
#
# 退出策略: 永远 exit 0 (Stop 阶段不应 block 会话结束)
# 信号通过 stdout markdown 回报 CC,方便看 session-level health

set -u

[ -z "${CLAUDE_PROJECT_DIR:-}" ] && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0

# 消耗 stdin(Stop event payload,暂不读用)
cat > /dev/null

REPORT_DIR=".ai/traces/$(date +%F)"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/harness-health.md"

# --- 1. wiki-lint ---
WIKI_OUT=$(pnpm run wiki-lint 2>&1)
WIKI_RC=$?

# --- 2. structure-lint ---
STRUCT_OUT=$(pnpm run structure-lint 2>&1)
STRUCT_RC=$?

# --- 3. harness-health ---
HEALTH_OUT=$(pnpm run harness-health --out "$REPORT" 2>&1)
HEALTH_RC=$?

# --- 4. 汇总到 stderr (CC transcript 可见,不打扰 stdout JSON) ---
{
  echo "=== Stop hook summary ==="
  if [ "$WIKI_RC" -eq 0 ]; then
    echo "🟢 wiki-lint: 三角闭合"
  else
    echo "🔴 wiki-lint fail (rc=$WIKI_RC)"
    echo "$WIKI_OUT" | tail -5
  fi
  if [ "$STRUCT_RC" -eq 0 ]; then
    echo "🟢 structure-lint: 目录结构合规"
  else
    echo "🔴 structure-lint fail (rc=$STRUCT_RC)"
    echo "$STRUCT_OUT" | tail -10
  fi
  if [ "$HEALTH_RC" -eq 0 ]; then
    echo "🟢 harness-health: 报告写入 $REPORT"
  else
    echo "🔴 harness-health fail (rc=$HEALTH_RC)"
  fi
} >&2

exit 0
