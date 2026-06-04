import { useState } from "react";

interface SexSelectProps {
  /** 0=未知 / 1=男 / 2=女(对齐老仓 SexSelect 取值)。 */
  value: number | undefined;
  onChange: (next: number) => Promise<void> | void;
}

const OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "未设置" },
  { value: 1, label: "男" },
  { value: 2, label: "女" },
];

/** 性别选择 — 简单 select(对齐老仓 SexSelect)。 */
export function SexSelect({ value, onChange }: SexSelectProps) {
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
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-text-tertiary">性别</span>
      <select
        value={value ?? 0}
        onChange={(e) => void onChangeInner(e)}
        disabled={saving}
        className="rounded border border-border-default bg-bg-surface px-2 py-1 text-sm text-text-primary"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
