import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";
import { validateScheduleConfig } from "@/features/summary/utils/summary-schedule";
import type { ScheduleConfig, ScheduleUnit } from "@/features/summary/types/summary.types";

interface ScheduleConfigModalProps {
  open: boolean;
  value: ScheduleConfig;
  onConfirm: (config: ScheduleConfig) => void;
  onCancel: () => void;
  hasExisting?: boolean;
  onDisable?: () => void;
  disabling?: boolean;
}

const DEFAULT_CONFIG: ScheduleConfig = { unit: "week", every: 1, time: "09:00" };
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function useResetScheduleConfigOnOpen(
  open: boolean,
  value: ScheduleConfig,
  setLocal: (config: ScheduleConfig) => void,
) {
  useEffect(() => {
    if (open) setLocal({ ...DEFAULT_CONFIG, ...value });
  }, [open, value, setLocal]);
}

function buildTimeOptions(): string[] {
  return Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? "00" : "30";
    return `${String(h).padStart(2, "0")}:${m}`;
  });
}

export function ScheduleConfigModal({
  open,
  value,
  onConfirm,
  onCancel,
  hasExisting = false,
  onDisable,
  disabling = false,
}: ScheduleConfigModalProps) {
  const tr = useT();
  const [local, setLocal] = useState<ScheduleConfig>({ ...DEFAULT_CONFIG, ...value });
  const timeOptions = useMemo(buildTimeOptions, []);

  useResetScheduleConfigOnOpen(open, value, setLocal);

  const updateLocal = (patch: Partial<ScheduleConfig>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      if (
        next.legacyCron &&
        ("every" in patch || "unit" in patch || "dayOfWeek" in patch || "dayOfMonth" in patch)
      ) {
        delete next.legacyCron;
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const err = validateScheduleConfig(local, tr);
    if (err) {
      message.error(err);
      return;
    }
    onConfirm({ ...local, every: Math.max(1, Math.floor(local.every || 1)) });
  };

  const isWeekMode = local.unit === "week";
  const isMonthMode = local.unit === "month";

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      size="fit"
      className="w-full max-w-md"
      title={tr("summary.schedule.config.title")}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {hasExisting && onDisable ? (
              <Button type="danger" theme="borderless" loading={disabling} onClick={onDisable}>
                {tr("summary.detail.disableSchedule")}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="tertiary" theme="borderless" onClick={onCancel}>
              {tr("summary.common.cancel")}
            </Button>
            <Button type="primary" theme="solid" onClick={handleConfirm}>
              {tr("summary.common.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-xs leading-5 text-text-tertiary">{tr("summary.schedule.config.desc")}</p>

        {local.legacyCron ? (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {tr("summary.schedule.config.legacyCronWarning")}
          </div>
        ) : null}

        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
          <span className="text-sm text-text-secondary">
            {tr("summary.schedule.config.frequency")}
          </span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm text-text-tertiary">
              {tr("summary.schedule.config.everyPrefix")}
            </span>
            <input
              type="number"
              min={1}
              max={9999}
              value={local.every}
              onChange={(event) => updateLocal({ every: Number(event.target.value) })}
              className="h-8 w-20 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            />
            <select
              value={local.unit}
              onChange={(event) => updateLocal({ unit: event.target.value as ScheduleUnit })}
              className="h-8 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="day">{tr("summary.schedule.config.unitDay")}</option>
              <option value="week">{tr("summary.schedule.config.unitWeek")}</option>
              <option value="month">{tr("summary.schedule.config.unitMonth")}</option>
            </select>
          </div>
        </div>

        {isWeekMode ? (
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <span className="text-sm text-text-secondary">
              {tr("summary.schedule.config.weekdayLabel")}
            </span>
            <select
              value={local.dayOfWeek || ""}
              onChange={(event) => updateLocal({ dayOfWeek: Number(event.target.value) || 0 })}
              className="h-8 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="">{tr("summary.schedule.config.weekdayPlaceholder")}</option>
              {WEEKDAY_KEYS.map((key, index) => (
                <option key={key} value={index + 1}>
                  {tr(`summary.schedule.config.weekday.${key}`)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {isMonthMode ? (
          <>
            <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
              <span className="text-sm text-text-secondary">
                {tr("summary.schedule.config.dayOfMonthFieldLabel")}
              </span>
              <select
                value={local.dayOfMonth || ""}
                onChange={(event) => updateLocal({ dayOfMonth: Number(event.target.value) || 0 })}
                className="h-8 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
              >
                <option value="">{tr("summary.schedule.config.dayOfMonthPlaceholder")}</option>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {tr("summary.schedule.config.dayOfMonthLabel", { values: { day } })}
                  </option>
                ))}
              </select>
            </div>
            <p className="pl-[100px] text-xs text-text-tertiary">
              {tr("summary.schedule.config.dayOfMonthHint")}
            </p>
          </>
        ) : null}

        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
          <span className="text-sm text-text-secondary">{tr("summary.schedule.config.time")}</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm text-text-tertiary">
              {tr("summary.schedule.config.atPrefix")}
            </span>
            <select
              value={local.time}
              onChange={(event) => updateLocal({ time: event.target.value })}
              className="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
