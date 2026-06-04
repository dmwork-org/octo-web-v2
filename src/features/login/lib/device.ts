import type { LoginDevice } from "@/features/base/api/endpoints/user.api";

/**
 * 设备信息(对齐老仓 dmworkbase App.tsx::WKApp.shared 的 deviceId/Name/Model)。
 *
 * - `device_id`:UUID,存 localStorage,首次访问生成。
 *   (老仓走 `StorageService.shared.getItem("deviceId")`;这里直接 localStorage 一致语义)
 * - `device_name`:OS + 版本(Windows 10 / MacOS 14.0 / iOS 17.0)
 * - `device_model`:浏览器 + 主版本(Chrome 130 / Safari 17 / Firefox 121)
 *
 * 用于所有登录 / 注册 / 二维码 mutation 的 device 字段透传。
 */

const DEVICE_ID_KEY = "octo:device-id";

/** PC 端 flag(对齐老仓 WuKongIM device type)。 */
export const DEVICE_FLAG_PC = 1;

function generateUUID(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // 兜底:RFC4122 v4
  const bytes = new Uint8Array(16);
  if (!c) {
    // 浏览器无 crypto(几乎不可能,SSR 已 guard)— 退化到时间戳
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  } else {
    c.getRandomValues(bytes);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr-no-device";
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateUUID();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return generateUUID(); // 隐身模式 / quota,每次新 UUID 兜底
  }
}

function getOsAndVersion(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Windows NT (\d+\.\d+)/i.test(ua)) {
    return `Windows ${ua.match(/Windows NT (\d+\.\d+)/i)?.[1] ?? "unknown"}`;
  }
  if (/Mac OS X (\d+_\d+(_\d+)?)/i.test(ua)) {
    const v = ua.match(/Mac OS X (\d+_\d+(_\d+)?)/i)?.[1]?.replace(/_/g, ".") ?? "unknown";
    return `MacOS ${v}`;
  }
  if (/Android (\d+(\.\d+)?)/i.test(ua)) {
    return `Android ${ua.match(/Android (\d+(\.\d+)?)/i)?.[1] ?? "unknown"}`;
  }
  if (/CPU (iPhone )?OS (\d+_\d+(_\d+)?)/i.test(ua)) {
    const v = ua.match(/CPU (iPhone )?OS (\d+_\d+(_\d+)?)/i)?.[2]?.replace(/_/g, ".") ?? "unknown";
    return `iOS ${v}`;
  }
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown OS";
}

function getBrowserBrand(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (/Edg\/(\d+)/i.test(ua)) return `Edge ${ua.match(/Edg\/(\d+)/i)?.[1]}`;
  if (/Chrome\/(\d+)/i.test(ua)) return `Chrome ${ua.match(/Chrome\/(\d+)/i)?.[1]}`;
  if (/Firefox\/(\d+)/i.test(ua)) return `Firefox ${ua.match(/Firefox\/(\d+)/i)?.[1]}`;
  if (/Safari\/(\d+)/i.test(ua) && !/Chrome/i.test(ua)) {
    return `Safari ${ua.match(/Version\/(\d+)/i)?.[1] ?? "?"}`;
  }
  return "Unknown browser";
}

/**
 * 构造完整 device payload(所有 user/login/* mutation 公用)。
 *
 * 每次调用都重新探测 UA + 读 localStorage device_id(成本可忽略,无 cache)。
 */
export function buildDevicePayload(): LoginDevice {
  return {
    device_id: getDeviceId(),
    device_name: getOsAndVersion(),
    device_model: getBrowserBrand(),
  };
}
