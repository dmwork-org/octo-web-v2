import { Lock } from "lucide-react";

/** "不在群" 小徽章，含锁图标 + 灰底圆角边框。 */
export function NotMemberBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-border-default bg-bg-muted px-1.5 py-px text-[10px] font-medium text-text-tertiary whitespace-nowrap">
      <Lock size={9} aria-hidden="true" />
      不在群
    </span>
  );
}
