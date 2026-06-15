import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";
import { spaceStore } from "@/features/base/stores/space";
import { conversationsQueryOptions } from "@/features/chat/queries/conversations.query";
import { createSchedule, updateSchedule } from "@/features/summary/api/summary.api";
import { schedulesQueryKey } from "@/features/summary/queries/summaries.query";
import {
  scheduleItemToConfig,
  scheduleToParams,
  validateScheduleConfig,
} from "@/features/summary/utils/summary-schedule";
import {
  SourceType,
  SummaryMode,
  TIME_RANGE_TYPE_KEY,
  type ScheduleItem,
  type SourceItem,
  type SummaryModeType,
  type ScheduleUnit,
  type TimeRangeTypeValue,
} from "@/features/summary/types/summary.types";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ScheduleFormModalProps {
  open: boolean;
  /** 编辑时传 schedule;新建时为 null */
  schedule: ScheduleItem | null;
  onClose: () => void;
}

const TIME_RANGE_OPTION_VALUES: TimeRangeTypeValue[] = [1, 2, 3, 4];
const CHANNEL_TYPE_THREAD = 5;
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function buildTimeOptions(): string[] {
  return Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 === 0 ? "00" : "30";
    return `${String(hour).padStart(2, "0")}:${minute}`;
  });
}

function convToSource(c: Conversation): SourceItem {
  const type =
    c.channel.channelType === ChannelTypeGroup
      ? SourceType.GROUP_CHAT
      : c.channel.channelType === ChannelTypePerson
        ? SourceType.DIRECT_MESSAGE
        : SourceType.THREAD;
  return {
    source_type: type,
    source_id: c.channel.channelID,
    source_name: c.channelInfo?.title ?? c.channel.channelID,
  };
}

/** open / schedule 翻转时重置表单字段。 */
function useResetFormOnOpen(
  open: boolean,
  schedule: ScheduleItem | null,
  setters: {
    setTitle: (v: string) => void;
    setMode: (v: SummaryModeType) => void;
    setEvery: (v: number) => void;
    setUnit: (v: ScheduleUnit) => void;
    setRunTime: (v: string) => void;
    setDayOfWeek: (v: number) => void;
    setDayOfMonth: (v: number) => void;
    setLegacyCron: (v: boolean) => void;
    setErrMsg: (v: string | null) => void;
    setTimeRangeType: (v: TimeRangeTypeValue) => void;
    setSelectedIds: (ids: Set<string>) => void;
  },
) {
  useEffect(() => {
    if (!open) return;
    setters.setTitle(schedule?.title ?? "");
    setters.setMode(schedule?.summary_mode ?? SummaryMode.BY_GROUP);
    const config = scheduleItemToConfig(schedule ?? {});
    setters.setEvery(config.every);
    setters.setUnit(config.unit);
    setters.setRunTime(config.time);
    setters.setDayOfWeek(config.dayOfWeek || 0);
    setters.setDayOfMonth(config.dayOfMonth || 0);
    setters.setLegacyCron(!!config.legacyCron);
    setters.setErrMsg(null);
    setters.setTimeRangeType(schedule?.time_range_type ?? 2);
    setters.setSelectedIds(new Set(schedule?.sources.map((s) => s.source_id) ?? []));
  }, [open, schedule, setters]);
}

/**
 * 定时总结新建 / 编辑表单(对应旧 ScheduleForm + ScheduleConfigModal)。
 *
 * 浮动元素壳层统一规范 Phase C5 — 走 BaseDialog。
 */
export function ScheduleFormModal({ open, schedule, onClose }: ScheduleFormModalProps) {
  const tr = useT();
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<SummaryModeType>(SummaryMode.BY_GROUP);
  const [every, setEvery] = useState(1);
  const [unit, setUnit] = useState<ScheduleUnit>("week");
  const [runTime, setRunTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(0);
  const [legacyCron, setLegacyCron] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [timeRangeType, setTimeRangeType] = useState<TimeRangeTypeValue>(2);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const timeOptions = useMemo(buildTimeOptions, []);

  useResetFormOnOpen(open, schedule, {
    setTitle,
    setMode,
    setEvery,
    setUnit,
    setRunTime,
    setDayOfWeek,
    setDayOfMonth,
    setLegacyCron,
    setErrMsg,
    setTimeRangeType,
    setSelectedIds,
  });

  const { data: conversations } = useQuery({
    ...conversationsQueryOptions(spaceId),
    enabled: open,
  });

  const candidates = useMemo(() => {
    return (conversations ?? []).filter(
      (c) =>
        c.channel.channelType === ChannelTypeGroup ||
        c.channel.channelType === ChannelTypePerson ||
        c.channel.channelType === CHANNEL_TYPE_THREAD,
    );
  }, [conversations]);

  const mu = useMutation({
    mutationFn: () => {
      const config = { unit, every, time: runTime, dayOfWeek, dayOfMonth };
      const err = validateScheduleConfig(config, t);
      if (err) {
        setErrMsg(err);
        throw new Error(err);
      }
      setErrMsg(null);
      const scheduleParams = scheduleToParams(config);
      const sources: SourceItem[] = candidates
        .filter((c) => selectedIds.has(c.channel.channelID))
        .map(convToSource);
      if (schedule) {
        for (const s of schedule.sources) {
          if (selectedIds.has(s.source_id) && !sources.some((x) => x.source_id === s.source_id)) {
            sources.push(s);
          }
        }
      }
      const payload = {
        title: title.trim(),
        summary_mode: mode,
        ...scheduleParams,
        time_range_type: timeRangeType,
        sources,
      };
      return schedule ? updateSchedule(schedule.schedule_id, payload) : createSchedule(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: schedulesQueryKey });
      toast.success(
        schedule ? t("summary.schedule.updatedToast") : t("summary.schedule.createdToast"),
      );
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("summary.common.saveFailed")),
  });

  const canSubmit = selectedIds.size > 0 && !mu.isPending;
  const isWeekMode = unit === "week";
  const isMonthMode = unit === "month";

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    mu.mutate();
  };

  const toggleSource = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="fit"
      title={schedule ? tr("summary.schedule.editTitle") : tr("summary.schedule.createTitle")}
      className="max-h-[90vh] w-full max-w-lg"
      contentClassName="overflow-hidden"
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tr("summary.common.cancel")}
          </Button>
          <Button
            htmlType="submit"
            form="schedule-form"
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={!canSubmit}
          >
            {tr("summary.common.save")}
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={onSubmit} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {tr("summary.schedule.titleLabel")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 1000))}
              placeholder={tr("summary.schedule.titlePlaceholder")}
              className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {tr("summary.schedule.modeLabel")}
            </span>
            <select
              value={mode}
              onChange={(e) => setMode(Number(e.target.value) as SummaryModeType)}
              className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              <option value={SummaryMode.BY_GROUP}>{tr("summary.mode.byGroup")}</option>
              <option value={SummaryMode.BY_PERSON}>{tr("summary.mode.byPerson")}</option>
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {tr("summary.schedule.frequencyLabel")}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-text-tertiary">
                {tr("summary.schedule.config.everyPrefix")}
              </span>
              <input
                type="number"
                min={1}
                max={9999}
                value={every}
                onChange={(event) => {
                  setEvery(Number(event.target.value));
                  setLegacyCron(false);
                }}
                className="h-9 w-20 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
              />
              <select
                value={unit}
                onChange={(event) => {
                  setUnit(event.target.value as ScheduleUnit);
                  setLegacyCron(false);
                }}
                className="h-9 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
              >
                <option value="day">{tr("summary.schedule.config.unitDay")}</option>
                <option value="week">{tr("summary.schedule.config.unitWeek")}</option>
                <option value="month">{tr("summary.schedule.config.unitMonth")}</option>
              </select>

              {isWeekMode ? (
                <>
                  <span className="text-sm text-text-tertiary">
                    {tr("summary.schedule.config.onWeekdayPrefix")}
                  </span>
                  <select
                    value={dayOfWeek || ""}
                    onChange={(event) => {
                      setDayOfWeek(Number(event.target.value) || 0);
                      setLegacyCron(false);
                    }}
                    className="h-9 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                  >
                    <option value="">{tr("summary.schedule.config.weekdayPlaceholder")}</option>
                    {WEEKDAY_KEYS.map((key, index) => (
                      <option key={key} value={index + 1}>
                        {tr(`summary.schedule.config.weekday.${key}`)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              {isMonthMode ? (
                <>
                  <span className="text-sm text-text-tertiary">
                    {tr("summary.schedule.config.onDayOfMonthPrefix")}
                  </span>
                  <select
                    value={dayOfMonth || ""}
                    onChange={(event) => {
                      setDayOfMonth(Number(event.target.value) || 0);
                      setLegacyCron(false);
                    }}
                    className="h-9 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                  >
                    <option value="">{tr("summary.schedule.config.dayOfMonthPlaceholder")}</option>
                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                      <option key={day} value={day}>
                        {tr("summary.schedule.config.dayOfMonthLabel", { values: { day } })}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              <span className="text-sm text-text-tertiary">
                {tr("summary.schedule.config.atPrefix")}
              </span>
              <select
                value={runTime}
                onChange={(event) => {
                  setRunTime(event.target.value);
                  setLegacyCron(false);
                }}
                className="h-9 rounded-md border border-border-default bg-bg-base px-2 text-sm text-text-primary focus:border-brand focus:outline-none"
              >
                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            </div>
            {legacyCron ? (
              <p className="text-xs text-warning">
                {tr("summary.schedule.config.legacyCronWarning")}
              </p>
            ) : null}
            {isMonthMode ? (
              <p className="text-xs text-text-tertiary">
                {tr("summary.schedule.config.dayOfMonthHint")}
              </p>
            ) : null}
            {errMsg ? <p className="text-xs text-error">{errMsg}</p> : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {tr("summary.schedule.timeRangeLabel")}
            </span>
            <select
              value={timeRangeType}
              onChange={(e) => setTimeRangeType(Number(e.target.value) as TimeRangeTypeValue)}
              className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              {TIME_RANGE_OPTION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tr(TIME_RANGE_TYPE_KEY[v])}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">
              {tr("summary.schedule.sourcesLabel", { values: { count: selectedIds.size } })}
            </span>
            <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border border-border-default bg-bg-base p-1">
              {candidates.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                  {tr("summary.schedule.noChats")}
                </div>
              ) : (
                candidates.map((c) => {
                  const id = c.channel.channelID;
                  const checked = selectedIds.has(id);
                  const isGroup = c.channel.channelType === ChannelTypeGroup;
                  const isThread = c.channel.channelType === CHANNEL_TYPE_THREAD;
                  const name = c.channelInfo?.title ?? id;
                  return (
                    <label
                      key={`${c.channel.channelType}-${id}`}
                      className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover ${
                        checked ? "bg-brand-tint" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSource(id)}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
                      <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                        {isThread
                          ? tr("summary.schedule.tagThread")
                          : isGroup
                            ? tr("summary.schedule.tagGroup")
                            : tr("summary.schedule.tagDirect")}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </form>
    </BaseDialog>
  );
}
