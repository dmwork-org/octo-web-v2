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
  SourceType,
  SummaryMode,
  TIME_RANGE_TYPE_KEY,
  type ScheduleItem,
  type SourceItem,
  type SummaryModeType,
  type TimeRangeTypeValue,
} from "@/features/summary/types/summary.types";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ScheduleFormModalProps {
  open: boolean;
  /** 编辑时传 schedule;新建时为 null */
  schedule: ScheduleItem | null;
  onClose: () => void;
}

const CRON_PRESETS: { value: string; labelKey: string }[] = [
  { value: "0 9 * * *", labelKey: "summary.schedule.cronPresetDaily" },
  { value: "0 9 * * 1-5", labelKey: "summary.schedule.cronPresetWorkdays" },
  { value: "0 9 * * 1", labelKey: "summary.schedule.cronPresetWeekly" },
  { value: "0 9 1 * *", labelKey: "summary.schedule.cronPresetMonthly" },
];

const TIME_RANGE_OPTION_VALUES: TimeRangeTypeValue[] = [1, 2, 3, 4];

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
    setCron: (v: string) => void;
    setUseCustomCron: (v: boolean) => void;
    setCustomCron: (v: string) => void;
    setTimeRangeType: (v: TimeRangeTypeValue) => void;
    setSelectedIds: (ids: Set<string>) => void;
  },
) {
  useEffect(() => {
    if (!open) return;
    setters.setTitle(schedule?.title ?? "");
    setters.setMode(schedule?.summary_mode ?? SummaryMode.BY_GROUP);
    const cron = schedule?.cron_expr ?? "0 9 * * 1";
    const isPreset = CRON_PRESETS.some((p) => p.value === cron);
    setters.setUseCustomCron(!isPreset);
    setters.setCron(isPreset ? cron : "0 9 * * 1");
    setters.setCustomCron(isPreset ? "" : cron);
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
  const [cron, setCron] = useState("0 9 * * 1");
  const [useCustomCron, setUseCustomCron] = useState(false);
  const [customCron, setCustomCron] = useState("");
  const [timeRangeType, setTimeRangeType] = useState<TimeRangeTypeValue>(2);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useResetFormOnOpen(open, schedule, {
    setTitle,
    setMode,
    setCron,
    setUseCustomCron,
    setCustomCron,
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
        c.channel.channelType === ChannelTypeGroup || c.channel.channelType === ChannelTypePerson,
    );
  }, [conversations]);

  const mu = useMutation({
    mutationFn: () => {
      const finalCron = (useCustomCron ? customCron : cron).trim();
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
        cron_expr: finalCron,
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

  const finalCron = (useCustomCron ? customCron : cron).trim();
  const canSubmit = !!finalCron && selectedIds.size > 0 && !mu.isPending;

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
            {!useCustomCron ? (
              <>
                <select
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {tr(p.labelKey)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setUseCustomCron(true)}
                  className="self-start text-[12px] text-brand hover:underline"
                >
                  {tr("summary.schedule.customCron")}
                </button>
              </>
            ) : (
              <>
                <input
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder={tr("summary.schedule.customCronPlaceholder")}
                  className="rounded-md border border-border-default bg-bg-base px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setUseCustomCron(false)}
                  className="self-start text-[12px] text-brand hover:underline"
                >
                  {tr("summary.schedule.usePreset")}
                </button>
              </>
            )}
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
                        {isGroup
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
