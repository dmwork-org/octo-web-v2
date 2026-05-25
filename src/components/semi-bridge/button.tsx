import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * semi-bridge/button — Semi UI Button 同名 props 包装,内部走 shadcn Button。
 *
 * 旧项目用 `<Button type="primary" theme="solid" size="default">`。业务层迁过来
 * 直接保留这些 prop 名,本桥层负责映射到 shadcn 的 variant/size。
 *
 * 仅覆盖旧项目实际用过的 type / theme 组合,不展开整个 Semi 矩阵。
 */

type SemiType = "primary" | "secondary" | "tertiary" | "warning" | "danger";
type SemiTheme = "solid" | "light" | "borderless";
type SemiSize = "small" | "default" | "large";

type ShadcnVariant = "default" | "secondary" | "ghost" | "destructive" | "outline";
type ShadcnSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-sm" | "icon-lg";

function resolveVariant(type: SemiType, theme: SemiTheme): ShadcnVariant {
  if (type === "danger") return "destructive";
  if (theme === "borderless") return "ghost";
  if (theme === "light") return "secondary";
  if (type === "secondary" || type === "tertiary") return "secondary";
  return "default";
}

function resolveSize(size: SemiSize, iconOnly: boolean): ShadcnSize {
  if (iconOnly) {
    return size === "small" ? "icon-sm" : size === "large" ? "icon-lg" : "icon";
  }
  return size === "small" ? "sm" : size === "large" ? "lg" : "default";
}

export interface ButtonProps extends Omit<React.ComponentProps<"button">, "type"> {
  type?: SemiType;
  theme?: SemiTheme;
  size?: SemiSize;
  loading?: boolean;
  /** Semi 兼容:仅渲染 icon 时切 icon-* size */
  iconOnly?: boolean;
  /** Semi 用 `htmlType` 区分 button 的 native type */
  htmlType?: "button" | "submit" | "reset";
}

export function Button({
  type = "primary",
  theme = "solid",
  size = "default",
  loading = false,
  iconOnly = false,
  htmlType = "button",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <ShadcnButton
      type={htmlType}
      variant={resolveVariant(type, theme)}
      size={resolveSize(size, iconOnly)}
      disabled={disabled || loading}
      className={cn(className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </ShadcnButton>
  );
}
