import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Tooltip(精简版,基于 radix-ui umbrella package)。
 *
 * 浮动元素壳层统一规范 Phase E2 — 替换全仓原生 `title=` 属性,获得可控样式 + 移动端兼容 +
 * a11y 完整 aria。
 *
 * 用法:
 * ```tsx
 * <Tooltip>
 *   <TooltipTrigger asChild>
 *     <button>X</button>
 *   </TooltipTrigger>
 *   <TooltipContent>关闭</TooltipContent>
 * </Tooltip>
 * ```
 *
 * 全局 `<TooltipProvider>` 已挂在 __root.tsx,delayDuration 默认 500ms。
 */

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-popover overflow-hidden rounded-md bg-[#1c1c23] px-2 py-1 text-[12px] text-white shadow-md",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=delayed-open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
