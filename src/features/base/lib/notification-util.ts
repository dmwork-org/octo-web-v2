/**
 * Web Notification API 薄封装 — 给 IM 桌面消息通知用。
 *
 * **职责**(对齐老仓 Utils/NotificationUtil.ts 的核心契约,不含 Electron 兼容):
 * - 检测能力 / 请求权限
 * - 单条全局 message notification(同 tag 替换,5s 自动关)
 * - 用户偏好(localStorage)— "已关闭桌面通知" 时直接 noop
 *
 * **page-visible 时不弹**:document.visibilityState === 'visible' 跳过(在用了不打扰)。
 *
 * 调用方做过滤(自己发的 / 静音 / 当前会话 / noPersist / 无 reddot 等),本模块只管"如何弹"。
 */
import { i18n } from "@/lib/i18n/instance";

const STORAGE_KEY = "octo:settings:desktopNotificationsOff";
const DEFAULT_TIMEOUT_MS = 5000;

export function isNotificationsOff(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationsOff(off: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (off) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore quota / private mode
  }
}

export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    window.Notification.permission !== "denied"
  );
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (window.Notification.permission === "default") {
    return window.Notification.requestPermission();
  }
  return window.Notification.permission;
}

export interface SendNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
  /** auto-close 毫秒数,默认 5s。<=0 不自动关。 */
  timeout?: number;
}

let currentNoti: Notification | null = null;
let currentTimer: number | null = null;

function closeCurrent(): void {
  if (currentTimer != null) {
    window.clearTimeout(currentTimer);
    currentTimer = null;
  }
  if (currentNoti) {
    currentNoti.close();
    currentNoti = null;
  }
}

export function sendNotification(opts: SendNotificationOptions): void {
  if (!isNotificationSupported()) return;
  if (window.Notification.permission !== "granted") return;
  if (isNotificationsOff()) return;
  // 页面活跃 — 用户在看,不弹(对齐 IM 类应用通行行为)
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  closeCurrent();
  try {
    const noti = new window.Notification(opts.title, {
      body: opts.body,
      icon: opts.icon,
      tag: opts.tag,
      lang: i18n.getLocale(),
    });
    if (opts.onClick) {
      noti.onclick = () => {
        noti.close();
        if (typeof window !== "undefined") window.focus();
        opts.onClick?.();
      };
    }
    const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;
    if (timeoutMs > 0) {
      currentTimer = window.setTimeout(() => noti.close(), timeoutMs);
    }
    currentNoti = noti;
  } catch {
    // 部分浏览器在某些上下文(insecure / iframe)会抛,静默
  }
}

export function closeAllNotifications(): void {
  closeCurrent();
}
