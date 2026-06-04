import { useEffect, useState } from "react";
import { api } from "@/features/base/api/client";

const FALLBACK_APK_URL = "/download/dmwork.apk";

/** 拉最新 APK URL(命名 hook 满足 no-useeffect-in-component)。 */
function useApkUrl(): string {
  const [apkUrl, setApkUrl] = useState<string>(FALLBACK_APK_URL);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await api<{ url?: string }>("common/updater/android/1.0");
        if (alive && r?.url) setApkUrl(r.url);
      } catch {
        // 保持 fallback
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return apkUrl;
}

/** Android 下载按钮 — 动态从 `/v1/common/updater/android/1.0` 拿 url,fallback 静态路径。 */
export function AndroidDownloadButton() {
  const apkUrl = useApkUrl();
  return (
    <a
      href={apkUrl}
      download
      className="inline-flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[#1C1C23] px-[18px] py-2 text-[13px] text-[#1C1C23] no-underline transition-opacity hover:opacity-80"
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C14.15 1.23 13.1 1 12 1c-1.1 0-2.15.23-3.12.63L7.4.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
      </svg>
      <span>下载 Android 客户端</span>
    </a>
  );
}

/** iOS TestFlight 公开 URL — 硬编码(老仓行为)。 */
export const IOS_DOWNLOAD_URL = "https://testflight.apple.com/join/uPrdCcy3";

export function IosDownloadButton() {
  return (
    <a
      href={IOS_DOWNLOAD_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[#1C1C23] px-[18px] py-2 text-[13px] text-[#1C1C23] no-underline transition-opacity hover:opacity-80"
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      <span>下载 iOS 客户端</span>
    </a>
  );
}

/** 安卓 + iOS 双按钮容器(对齐老仓 `.wk-login-content-download`)。 */
export function DownloadButtons() {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-[#eef0f5] pt-5">
      <AndroidDownloadButton />
      <IosDownloadButton />
    </div>
  );
}
