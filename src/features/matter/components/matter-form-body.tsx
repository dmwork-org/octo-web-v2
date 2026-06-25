import { useEffect, useRef, useState } from "react";
import { Channel } from "wukongimjssdk";
import { useT } from "@/lib/i18n/use-t";
import { MemberSelect } from "@/features/base/components/member-select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  todayDateStr,
  parseDateStr,
  formatDateStr,
  type MatterFormValues,
} from "@/features/matter/lib/matter-form";

interface MatterFormBodyProps {
  values: MatterFormValues;
  onChange: (patch: Partial<MatterFormValues>) => void;
  /** 选人候选源(传 channel 走群成员;不传走 Space 全员)。 */
  channel?: Channel;
  /** title input 是否锁(老仓 sendOnConfirm 时 readonly + tint03 底)。 */
  titleReadonly?: boolean;
  /** mount 后自动聚焦标题。 */
  autoFocus?: boolean;
}

/** 标签 + 必填星 + 内容。 */
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm leading-5 font-semibold text-text-strong">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>
      {children}
    </div>
  );
}

/** 50ms 后聚焦标题(命名 hook,满足 no-useeffect-in-component)。 */
function useAutoFocusTitle(
  enabled: boolean | undefined,
  ref: React.RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => ref.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [enabled, ref]);
}

/**
 * 共享 4 字段表单(对齐旧 dmworktodo CreateTaskModal + SmartCreateModal 内字段):
 *   ① 事项名称(200 字)
 *   ② 主要目标(200 字 + 计数,placeholder "一句话说清这件事")
 *   ③ 负责人(MemberSelect — 候选源由 channel prop 控制)
 *   ④ Deadline(date,today+)
 *
 * 受控:values + onChange(patch)。校验由调用方做(isMatterFormValid 后开启 confirm)。
 *
 * Title 50ms 后 autofocus(对齐旧 setTimeout(focus, 50) — 等 modal 动画完)。
 */
export function MatterFormBody({
  values,
  onChange,
  channel,
  titleReadonly,
  autoFocus,
}: MatterFormBodyProps) {
  const t = useT();
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocusTitle(autoFocus, titleRef);

  return (
    <>
      <Field label={t("matter.field.title")} required>
        <input
          ref={titleRef}
          type="text"
          value={values.title}
          onChange={
            titleReadonly ? undefined : (e) => onChange({ title: e.target.value.slice(0, 200) })
          }
          placeholder={t("matter.common.inputPlaceholder")}
          maxLength={200}
          readOnly={titleReadonly}
          className={`h-8 w-full rounded-sm border-0 px-3 text-sm leading-5 text-text-primary placeholder:text-brand/30 focus:outline-none ${
            titleReadonly
              ? "cursor-default bg-brand/[0.03] text-text-secondary"
              : "bg-brand/[0.04] focus:bg-brand/[0.06]"
          }`}
        />
      </Field>

      <Field label={t("matter.field.goal")} required>
        <div className="relative">
          <textarea
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value.slice(0, 200) })}
            placeholder={t("matter.create.descPlaceholder")}
            rows={3}
            maxLength={200}
            className="block h-[75px] w-full resize-none rounded-sm border-0 bg-brand/[0.04] px-3 pt-1.5 pb-5 font-sans text-sm leading-5 text-text-primary placeholder:text-brand/30 focus:bg-brand/[0.06] focus:outline-none"
          />
          <span className="pointer-events-none absolute right-3 bottom-1.5 text-xs leading-4 text-text-tertiary">
            {values.description.length}/200
          </span>
        </div>
      </Field>

      <Field label={t("matter.field.assignee")} required>
        <MemberSelect
          value={values.assigneeUids}
          onChange={(uids) => onChange({ assigneeUids: uids })}
          channel={channel}
          placeholder={t("matter.common.selectPlaceholder")}
        />
      </Field>

      <Field label="Deadline" required>
        <DeadlineField value={values.deadline} onChange={(deadline) => onChange({ deadline })} />
      </Field>
    </>
  );
}

/**
 * Deadline 选择(组件化日历,对齐事项详情 DeadlinePicker 用的 Popover + Calendar,
 * 不用原生 <input type="date">)。受控值为 YYYY-MM-DD 字符串。
 */
function DeadlineField({
  value,
  onChange,
}: {
  value: string;
  onChange: (deadline: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const today = todayDateStr();
  const selectedDate = parseDateStr(value);
  // 禁选今天之前(对齐原 min={today})。
  const minDate = parseDateStr(today);

  const handleSelect = (d: Date | undefined) => {
    if (!d) return;
    onChange(formatDateStr(d));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-8 w-full items-center rounded-sm border-0 bg-brand/[0.04] px-3 text-left text-sm transition-colors hover:bg-brand/[0.06] focus:bg-brand/[0.06] focus:outline-none ${
            value ? "text-text-primary" : "text-brand/30"
          }`}
        >
          {value || t("matter.common.selectPlaceholder")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-dialog-secondary w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={minDate ? { before: minDate } : undefined}
          defaultMonth={selectedDate}
        />
      </PopoverContent>
    </Popover>
  );
}
