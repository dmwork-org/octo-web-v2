import { toast as sonnerToast } from "sonner";

/**
 * semi-bridge/toast — Semi UI Toast 同名包装,内部走 sonner。
 *
 * 旧项目用 `import { Toast } from "@douyinfe/semi-ui"; Toast.success(...)`。
 * 业务层迁过来后改为 `import { toast } from "@/components/semi-bridge/toast"`,
 * 调用面保持 `toast.success / error / info / warning`。
 *
 * 需要在 root 渲染 <Toaster />(见 routes/__root.tsx 或 main.tsx)。
 */

type ToastFn = (message: string) => void;

interface Toast {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  warning: ToastFn;
  /** alias for warning(Semi 旧代码兼容) */
  warn: ToastFn;
}

export const toast: Toast = {
  success: (m) => sonnerToast.success(m),
  error: (m) => sonnerToast.error(m),
  info: (m) => sonnerToast.info(m),
  warning: (m) => sonnerToast.warning(m),
  warn: (m) => sonnerToast.warning(m),
};

export { Toaster } from "sonner";
