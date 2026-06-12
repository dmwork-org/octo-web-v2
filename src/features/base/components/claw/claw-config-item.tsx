/**
 * 单条配置信息(图标 + 标签 + 值,垂直)。
 *
 * 对齐老仓 `dmworkbase/Components/ClawConfigItem`,CSS → Tailwind。
 */

import type { ReactNode } from "react";

interface ClawConfigItemProps {
  icon: ReactNode;
  label: string;
  value: string;
}

export function ClawConfigItem({ icon, label, value }: ClawConfigItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,0,0,0.04)] text-text-tertiary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="text-[11px] text-text-tertiary">{label}</div>
        <div className="truncate text-[13px] font-medium text-text-primary">{value}</div>
      </div>
    </div>
  );
}
