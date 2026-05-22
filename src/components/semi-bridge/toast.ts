type ToastFn = (message: string) => void;

interface Toast {
  error: ToastFn;
  success: ToastFn;
  info: ToastFn;
  warn: ToastFn;
}

function emit(level: "error" | "warn" | "info" | "success", message: string): void {
  if (typeof window === "undefined") return;
  const tag = `[toast:${level}]`;
  if (level === "error") {
    console.error(tag, message);
  } else if (level === "warn") {
    console.warn(tag, message);
  } else {
    console.info(tag, message);
  }
}

export const toast: Toast = {
  error: (m) => emit("error", m),
  success: (m) => emit("success", m),
  info: (m) => emit("info", m),
  warn: (m) => emit("warn", m),
};
