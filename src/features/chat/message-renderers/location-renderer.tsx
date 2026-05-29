import { MapPin } from "lucide-react";
import type { Message } from "wukongimjssdk";
import { LocationContent } from "@/features/base/im/location-content";

/**
 * 位置消息(对应旧 dmworkbase Messages/Location LocationCell):title + address +
 * 封面图;click 打开高德 lbs 静态地图新窗口(经纬度 clamp 到合法范围)。
 *
 * 旧版 cover 走 `WKApp.dataSource.commonDataSource.getFileURL(content.img)`,本期
 * 简化:直接用 content.img URL(假定后端已返回绝对路径或 CDN url)。如果发现是
 * 相对路径,后续接 file URL resolver。
 */
export function LocationRenderer({ message }: { message: Message }) {
  const content = message.content as LocationContent;
  const onClick = () => {
    const lng = Math.min(180, Math.max(-180, Number(content.lng) || 0));
    const lat = Math.min(90, Math.max(-90, Number(content.lat) || 0));
    const url = new URL("https://lbs.amap.com/tools/showmap/");
    url.search = `?1_800_460_${lng}_${lat}`;
    url.searchParams.set("title", content.title || "");
    url.searchParams.set("address", content.address || "");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-72 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-elevated text-left transition-colors hover:bg-bg-hover"
    >
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-text-primary">{content.title}</span>
          <span className="truncate text-[11px] text-text-tertiary">{content.address}</span>
        </div>
      </div>
      {content.img ? (
        <div
          className="mt-2 h-32 w-full bg-bg-base bg-cover bg-center"
          style={{ backgroundImage: `url(${content.img})` }}
        />
      ) : null}
    </button>
  );
}
