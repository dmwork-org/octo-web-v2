/**
 * 客户端设备 UUID(对齐旧 dmworkbase WKApp.shared.deviceId):
 *
 * 后端 /sidebar/sync / /user/devices/{} 等接口要求传 device_uuid 区分多端登录。
 * 持久化到 localStorage(`deviceId` key);首次访问时 lazy 生成 UUID v4。
 *
 * 不放在 store 里 — 这是个**进程内常量**,生成后不会变,组件不需要订阅变化。
 * 直接函数调用拿即可,首次 storage miss 时同步写回。
 */

const STORAGE_KEY = "deviceId";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 兜底实现(test 环境 / 老浏览器),非加密强度但足够区分设备
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  let id = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (!id) {
    id = generateUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  cached = id;
  return id;
}
