import { useState } from "react";
import { useT } from "@/lib/i18n/use-t";

interface SexSelectProps {
  /** 0=未知 / 1=男 / 2=女(对齐老仓 SexSelect 取值)。 */
  value: number | undefined;
  onChange: (next: number) => Promise<void> | void;
}

/** 性别选择 — 简单 select(对齐老仓 SexSelect)。 */
export function SexSelect({ value, onChange }: SexSelectProps) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const onChangeInner = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    setSaving(true);
    try {
      await onChange(v);
    } finally {
      setSaving(false);
    }
  };
  const options: { value: number; label: string }[] = [
    { value: 0, label: t("user.sex.opt0") },
    { value: 1, label: t("user.sex.opt1") },
    { value: 2, label: t("user.sex.opt2") },
  ];
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-text-tertiary">{t("user.sex.label")}</span>
      <select
        value={value ?? 0}
        onChange={(e) => void onChangeInner(e)}
        disabled={saving}
        className="rounded border border-border-default bg-bg-surface px-2 py-1 text-sm text-text-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
