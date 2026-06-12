import { Cpu, FolderOpen, Globe, HardDrive, Monitor, Package, Users } from "lucide-react";
import type { RuntimeInfo } from "@/features/base/api/endpoints/agent-card.api";
import { ClawConfigItem } from "@/features/base/components/claw/claw-config-item";
import {
  ClawHealthCheckItem,
  type HealthStatus,
} from "@/features/base/components/claw/claw-health-check-item";
import { useT } from "@/lib/i18n/use-t";

interface ClawOverviewTabProps {
  runtimeInfo: RuntimeInfo;
  onRecheck?: () => void;
}

/**
 * 龙虾信息概览 tab(对齐老仓 `ClawOverviewTab`):
 * - 上半 OpenClaw 配置(7 项 grid)
 * - 下半 健康检查(进程 / Gateway / Node.js / 内存)
 */
export function ClawOverviewTab({ runtimeInfo, onRecheck }: ClawOverviewTabProps) {
  const t = useT();

  const processStatus: HealthStatus =
    runtimeInfo.process_status === "running" ? "success" : "error";
  const gatewayStatus: HealthStatus =
    runtimeInfo.gateway_status !== "connected"
      ? "error"
      : runtimeInfo.network_latency_ms != null && runtimeInfo.network_latency_ms > 100
        ? "warning"
        : "success";
  const nodejsStatus: HealthStatus = runtimeInfo.nodejs_version ? "success" : "error";
  const memoryStatus: HealthStatus = runtimeInfo.memory_gb >= 4 ? "success" : "warning";

  return (
    <div className="flex flex-col gap-4">
      <Card title={t("base.claw.overview.configInfo")}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <ClawConfigItem
            icon={<Monitor />}
            label={t("base.claw.overview.osVersion")}
            value={runtimeInfo.os_version}
          />
          <ClawConfigItem
            icon={<Cpu />}
            label={t("base.claw.overview.arch")}
            value={runtimeInfo.arch}
          />
          <ClawConfigItem
            icon={<HardDrive />}
            label={t("base.claw.overview.writableDiskSpace")}
            value={`${runtimeInfo.disk_space_gb.toFixed(1)} GB`}
          />
          <ClawConfigItem
            icon={<FolderOpen />}
            label={t("base.claw.overview.appDataDir")}
            value={runtimeInfo.app_data_dir}
          />
          <ClawConfigItem
            icon={<Package />}
            label={t("base.claw.overview.clawVersion")}
            value={runtimeInfo.claw_version}
          />
          <ClawConfigItem
            icon={<Globe />}
            label={t("base.claw.overview.adminUrl")}
            value={runtimeInfo.admin_url}
          />
          <ClawConfigItem
            icon={<Users />}
            label={t("base.claw.overview.teamName")}
            value={runtimeInfo.team_name}
          />
        </div>
      </Card>

      <Card
        title={t("base.claw.overview.healthCheck")}
        right={
          <>
            <span className="text-[12px] text-text-tertiary">
              {t("base.claw.overview.localEnvironment")} {runtimeInfo.gateway_alive_agents}/
              {runtimeInfo.gateway_total_agents}
            </span>
            {onRecheck ? (
              <button
                type="button"
                onClick={onRecheck}
                className="rounded-md border border-border-default px-2 py-1 text-[12px] text-text-secondary hover:bg-bg-hover"
              >
                {t("base.claw.overview.recheck")}
              </button>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ClawHealthCheckItem
            status={processStatus}
            label={t("base.claw.overview.process")}
            value={
              runtimeInfo.process_status === "running"
                ? t("base.claw.overview.running")
                : t("base.claw.overview.stopped")
            }
          />
          <ClawHealthCheckItem
            status={gatewayStatus}
            label={t("base.claw.overview.gatewayConnection")}
            value={
              runtimeInfo.gateway_status === "connected"
                ? runtimeInfo.network_latency_ms != null
                  ? t("base.claw.overview.latency", {
                      values: { value: runtimeInfo.network_latency_ms.toFixed(2) },
                    })
                  : t("base.claw.overview.connected")
                : t("base.claw.overview.disconnected")
            }
          />
          <ClawHealthCheckItem
            status={nodejsStatus}
            label="Node.js"
            value={runtimeInfo.nodejs_version}
          />
          <ClawHealthCheckItem
            status={memoryStatus}
            label={t("base.claw.overview.memory")}
            value={`${runtimeInfo.memory_gb.toFixed(0)}GB`}
          />
        </div>
      </Card>
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border-default bg-bg-base p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}
