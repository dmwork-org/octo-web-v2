/**
 * Switch + ToggleRow — 开关式表单行。
 *
 * 来源:`src/features/chat/components/channel-setting-modal.tsx` L86-181。
 *
 * **Switch**:极简胶囊开关(`h-5 w-9`),`bg-success`(开) / `bg-bg-elevated`(关)。
 * **ToggleRow**:title 左 + Switch 右,常用于"消息免打扰" / "置顶" / "通知设置" 等场景。
 */
function Switch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-success" : "bg-bg-elevated"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function ToggleRow({
  title,
  checked,
  loading,
  onChange,
}: {
  title: string;
  checked: boolean;
  loading: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex w-full items-center gap-2 px-4 py-2.5">
      <span className="flex-1 truncate text-[13px] text-text-primary">{title}</span>
      <Switch checked={checked} disabled={loading} onChange={onChange} />
    </div>
  );
}

export { Switch };
