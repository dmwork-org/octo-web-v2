import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getAgentCard,
  type AgentCardData,
  type SessionInfo,
} from "@/features/base/api/endpoints/agent-card.api";
import { ClawOverviewTab } from "@/features/base/components/claw/claw-overview-tab";
import { ClawCoreFilesTab } from "@/features/base/components/claw/claw-core-files-tab";
import { ClawSessionItem } from "@/features/base/components/claw/claw-session-item";
import { useT } from "@/lib/i18n/use-t";

interface ClawInfoModalProps {
  botId: string;
  botName?: string;
  open: boolean;
  onClose: () => void;
}

type TabId = "overview" | "session" | "files";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getRelativeTime(
  iso: string,
  t: (k: string, opts?: { values?: Record<string, string | number> }) => string,
): string {
  const reportTime = new Date(iso).getTime();
  if (Number.isNaN(reportTime)) return t("base.claw.unknown");
  const diffMs = Date.now() - reportTime;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("base.claw.justNow");
  if (min < 60) return t("base.claw.minutesAgo", { values: { n: min } });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("base.claw.hoursAgo", { values: { n: hr } });
  const day = Math.floor(hr / 24);
  return t("base.claw.daysAgo", { values: { n: day } });
}

/** 上报新鲜度判定:< 2h 绿 / < 6h 橙 / 其余红。 */
function getReportFreshness(iso: string): "green" | "orange" | "red" {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "red";
  const hours = (Date.now() - t) / 3_600_000;
  if (hours < 2) return "green";
  if (hours < 6) return "orange";
  return "red";
}

const FRESH_COLOR: Record<"green" | "orange" | "red", string> = {
  green: "text-[#16a34a]",
  orange: "text-[#ea580c]",
  red: "text-[#dc2626]",
};

/**
 * 龙虾详情主弹窗(对齐老仓 `ClawInfoModal`):
 * - 头部:bot 名 + 网关 / claw_id / 进程状态 / 上报时间
 * - 3 tab 切换:Overview / Session / Core Files
 * - botId 变化时 useQuery 自动重拉,失败用 null(API 已静默)
 */
export function ClawInfoModal({ botId, botName, open, onClose }: ClawInfoModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["agent-card", "data", botId],
    queryFn: () => getAgentCard(botId),
    enabled: open && !!botId,
    staleTime: 30 * 1000,
  });

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="xl"
      height="lg"
      title={<ClawTitle data={data} botName={botName} isLoading={isLoading} />}
      contentClassName="px-0 py-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <Tabs active={activeTab} onChange={setActiveTab} />
        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {activeTab === "overview" ? <OverviewPanel data={data} isLoading={isLoading} /> : null}
          {activeTab === "session" ? (
            <SessionPanel data={data} botName={botName} botId={botId} isLoading={isLoading} />
          ) : null}
          {activeTab === "files" ? (
            <ClawCoreFilesTab botId={botId} agentCardData={data ?? null} />
          ) : null}
        </div>
      </div>
    </BaseDialog>
  );
}

function ClawTitle({
  data,
  botName,
  isLoading,
}: {
  data: AgentCardData | null | undefined;
  botName: string | undefined;
  isLoading: boolean;
}) {
  const t = useT();
  const ri = data?.runtime_info;
  const statusText =
    ri?.process_status === "running"
      ? t("base.claw.status.running")
      : ri?.process_status === "idle"
        ? t("base.claw.status.idle")
        : t("base.claw.status.closed");
  const statusDotCls =
    ri?.process_status === "running"
      ? "bg-[#22c55e]"
      : ri?.process_status === "idle"
        ? "bg-[#f59e0b]"
        : "bg-text-tertiary";
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="truncate text-[16px] font-semibold text-text-primary">
        {botName || ri?.gateway_name || (isLoading ? t("base.claw.loading") : "—")}
      </h1>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-tertiary">
        <span>
          {t("base.claw.gatewayLabel")} {ri?.gateway_name || "—"}
        </span>
        <span>·</span>
        <span>ID: {ri?.claw_id || "—"}</span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${statusDotCls}`} />
          {statusText}
        </span>
        {data?.last_report_at ? (
          <>
            <span>·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`inline-flex items-center gap-1 ${FRESH_COLOR[getReportFreshness(data.last_report_at)]}`}
                >
                  <Clock size={12} />
                  {formatDateTime(data.last_report_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {t("base.claw.reportedAt", {
                  values: { time: getRelativeTime(data.last_report_at, t) },
                })}
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Tabs({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  const t = useT();
  const items: { id: TabId; label: string }[] = [
    { id: "overview", label: t("base.claw.tabs.overview") },
    { id: "session", label: t("base.claw.tabs.sessionInfo") },
    { id: "files", label: t("base.claw.tabs.coreFiles") },
  ];
  return (
    <div className="flex shrink-0 gap-2 border-b border-border-default px-4">
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(it.id)}
            className={`relative px-3 py-2.5 text-[13px] font-medium transition-colors ${
              isActive
                ? "text-brand after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-brand"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function OverviewPanel({
  data,
  isLoading,
}: {
  data: AgentCardData | null | undefined;
  isLoading: boolean;
}) {
  const t = useT();
  if (isLoading) return <CenteredMessage text={t("base.claw.loading")} />;
  if (!data?.runtime_info) return <CenteredMessage text={t("base.claw.loadFailed")} />;
  return <ClawOverviewTab runtimeInfo={data.runtime_info} />;
}

function SessionPanel({
  data,
  botName,
  botId,
  isLoading,
}: {
  data: AgentCardData | null | undefined;
  botName: string | undefined;
  botId: string;
  isLoading: boolean;
}) {
  const t = useT();
  if (isLoading) return <CenteredMessage text={t("base.claw.loading")} />;
  if (!data) return <CenteredMessage text={t("base.claw.loadFailed")} />;

  const sessions = data.sessions ?? [];
  // running 在前
  const sorted = [...sessions].sort((a, b) => {
    const ar = a.status === "running" ? 1 : 0;
    const br = b.status === "running" ? 1 : 0;
    return br - ar;
  });

  if (sorted.length === 0) {
    return <CenteredMessage text={t("base.claw.noActiveSessions")} />;
  }

  const mapSession = (s: SessionInfo) => {
    const peerType =
      s.peer_type === "private"
        ? t("base.claw.peer.private")
        : s.peer_type === "group"
          ? t("base.claw.peer.group")
          : "";
    const channel = peerType ? `${s.channel}(${peerType})` : s.channel;
    return {
      key: s.session_key,
      status: s.status,
      channel,
      peerDisplayName: s.peer_display_name,
      peerName: s.peer_name,
      botName: botName || t("base.claw.unknownBot"),
      botId,
      model: s.model,
      ctxUsed: s.context_used,
      ctxMax: s.context_total,
      sessionId: s.session_id,
      lastMsg: s.last_user_message,
      lastActiveAt: s.last_active_at,
    };
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[12px] text-text-secondary">
        {t("base.claw.sessionCount", {
          values: { running: data.session_running_count ?? 0, total: data.session_total ?? 0 },
        })}
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((s) => (
          <ClawSessionItem key={s.session_id} session={mapSession(s)} />
        ))}
      </div>
    </div>
  );
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-12 text-text-tertiary">{text}</div>
  );
}
