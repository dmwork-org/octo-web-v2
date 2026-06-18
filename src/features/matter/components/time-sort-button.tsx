interface TimeSortButtonProps {
  sortNewest: boolean;
  onToggle: () => void;
  label: string;
  title?: string;
  className?: string;
}

export function TimeSortButton({
  sortNewest,
  onToggle,
  label,
  title,
  className = "inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm font-medium leading-5 text-text-primary transition-opacity hover:opacity-80",
}: TimeSortButtonProps) {
  return (
    <button type="button" title={title} className={className} onClick={onToggle}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M7.33333 10.667L4.66667 13.3337L2 10.667M4.66667 13.3337V2.66699"
          stroke="currentColor"
          strokeOpacity={sortNewest ? 1 : 0.4}
          strokeWidth="1.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8.66602 5.33366L11.3327 2.66699L13.9993 5.33366M11.3327 2.66699V13.3337"
          stroke="currentColor"
          strokeOpacity={sortNewest ? 0.4 : 1}
          strokeWidth="1.33"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
}
