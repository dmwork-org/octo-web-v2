import { useState } from "react";
import { useT } from "@/lib/i18n/use-t";

/**
 * Session 卡片(对齐老仓 `ClawSessionItem`)。
 *
 * 折叠态:status badge + channel chip + peer 名字 + 展开箭头。
 * 展开态:session_key / bot / model / last_active / session_id / 上下文进度条。
 *
 * **变化(对齐老仓简化)**:
 * - CSS → Tailwind
 * - 老仓 useI18n / I18nFormatter date 双轨,新仓统一 toLocaleString
 * - props 字段名沿用老仓 camelCase(避免 caller 多一层映射)
 */

type Status = "running" | "done" | "failed" | "killed" | "timeout";

interface SessionData {
  /** session_key 透传(如 octo:c_pipi_lux_01) */
  key: string;
  status: Status;
  /** 渠道名(如 Octo / Discord / 飞书) */
  channel: string;
  /** 对话方原始名 / ID */
  peerName?: string;
  /** 对话方展示名(更友好) */
  peerDisplayName?: string;
  botName: string;
  botId: string;
  model: string;
  ctxUsed: number;
  ctxMax: number;
  sessionId: string;
  lastMsg: string;
  /** ISO 8601 */
  lastActiveAt: string;
}

interface ClawSessionItemProps {
  session: SessionData;
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const STATUS_BADGE: Record<Status, { text: string; cls: string }> = {
  running: {
    text: "RUNNING",
    cls: "bg-[rgba(34,197,94,0.12)] text-[#16a34a]",
  },
  done: { text: "DONE", cls: "bg-[rgba(100,116,139,0.15)] text-[#64748b]" },
  failed: { text: "FAILED", cls: "bg-[rgba(239,68,68,0.12)] text-[#dc2626]" },
  killed: { text: "KILLED", cls: "bg-[rgba(239,68,68,0.12)] text-[#dc2626]" },
  timeout: { text: "TIMEOUT", cls: "bg-[rgba(239,68,68,0.12)] text-[#dc2626]" },
};

export function ClawSessionItem({ session }: ClawSessionItemProps) {
  const t = useT();
  const [collapsed, setCollapsed] = useState(true);
  const ctxPercent = session.ctxMax > 0 ? Math.round((session.ctxUsed / session.ctxMax) * 100) : 0;
  const isHighCtx = ctxPercent > 70;
  const badge = STATUS_BADGE[session.status];

  return (
    <div className="overflow-hidden rounded-lg border border-border-default bg-bg-base">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
      >
        <span
          className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.4px] ${badge.cls}`}
        >
          {badge.text}
        </span>
        <span className="inline-flex shrink-0 items-center rounded-md bg-[rgba(0,0,0,0.04)] px-1.5 py-0.5 text-[11px] text-text-secondary">
          {session.channel}
        </span>
        {(session.peerDisplayName || session.peerName) && (
          <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
            {session.peerDisplayName || session.peerName}
            {session.peerDisplayName && session.peerName && (
              <span className="ml-1 text-text-tertiary">({session.peerName})</span>
            )}
          </span>
        )}
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t border-border-default px-3 py-3">
          <Field label="Session Key" value={session.key} span={3} mono />
          <Field label="Bot" value={`${session.botName} (@${session.botId})`} />
          <Field label={t("base.claw.session.model")} value={session.model} />
          <Field
            label={t("base.claw.session.lastActiveAt")}
            value={formatDateTime(session.lastActiveAt)}
          />
          <Field label="SESSION ID" value={session.sessionId} span={2} mono />
          <div className="col-span-3 flex flex-col gap-1">
            <span className="text-[11px] text-text-tertiary">
              {t("base.claw.session.contextWindow")}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(0,0,0,0.06)]">
                <div
                  className={`h-full rounded-full transition-all ${isHighCtx ? "bg-[#f59e0b]" : "bg-[#22c55e]"}`}
                  style={{ width: `${ctxPercent}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] text-text-tertiary tabular-nums">
                {(session.ctxUsed / 1000).toFixed(1)}K / {(session.ctxMax / 1000).toFixed(0)}K (
                {ctxPercent}%)
              </span>
            </div>
          </div>
          {session.lastMsg && (
            <Field label={t("base.claw.session.lastMsg")} value={session.lastMsg} span={3} />
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  span = 1,
  mono = false,
}: {
  label: string;
  value: string;
  span?: 1 | 2 | 3;
  mono?: boolean;
}) {
  const spanCls = span === 3 ? "col-span-3" : span === 2 ? "col-span-2" : "";
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${spanCls}`}>
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <span
        className={`truncate text-[12px] text-text-primary ${mono ? "font-mono" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}
