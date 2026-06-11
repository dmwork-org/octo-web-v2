import { message, type MessageOptions } from "@/components/ui/message";

/**
 * semi-bridge/toast — Semi UI Toast 同名包装,内部走自家 Message 系统
 * (sonner 已下线 — issue #36 UI 重做 + 加 key 去重)。
 *
 * 旧项目用 `import { Toast } from "@douyinfe/semi-ui"; Toast.success(...)`。
 * 业务层迁过来后改为 `import { toast } from "@/components/semi-bridge/toast"`,
 * 调用面保持 `toast.success / error / info / warning`(本仓 47 处 callsite 无需改)。
 *
 * **key 去重(issue #36)**:每个方法接受第二个 opts 参数,`{ key, duration }`:
 *   toast.error("网络异常", { key: "net-error" });  // 同 key 不堆叠多条
 *
 * `loading(msg)` 返回 id,`dismiss(id)` 关闭 — 用于长操作的"加载中..."三态
 * (toast.loading → await op → toast.dismiss + toast.success/warning)。
 *
 * 需要在 root 渲染 `<MessageContainer />`(见 routes/__root.tsx)。
 *
 * **新代码推荐**:直接 `import { message } from "@/components/ui/message"`,
 * 语义更清晰;本 bridge 仅为兼容既有 47 处 callsite。
 */

type ToastFn = (message: string, options?: MessageOptions) => number;

interface Toast {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  warning: ToastFn;
  /** alias for warning(Semi 旧代码兼容) */
  warn: ToastFn;
  /** 显示加载中 toast(不自动消失),返回 id 供后续 dismiss。 */
  loading: ToastFn;
  /** 关闭指定 id 或 key 的 toast(配合 loading / key 去重场景使用)。 */
  dismiss: (idOrKey: number | string) => void;
}

export const toast: Toast = {
  success: (m, opts) => message.success(m, opts),
  error: (m, opts) => message.error(m, opts),
  info: (m, opts) => message.info(m, opts),
  warning: (m, opts) => message.warning(m, opts),
  warn: (m, opts) => message.warning(m, opts),
  loading: (m, opts) => message.loading(m, opts),
  dismiss: (id) => message.dismiss(id),
};
