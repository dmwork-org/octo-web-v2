import { MessageContent } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 位置消息(对应旧 dmworkbase Messages/Location):lng/lat + 标题 + 地址 +
 * 封面图 url。本期点 → 打开高德 lbs.amap.com 静态地图新窗口。
 */
export class LocationContent extends MessageContent {
  lng = 0;
  lat = 0;
  title = "";
  address = "";
  img = "";

  decodeJSON(content: Record<string, unknown>): void {
    this.lng = typeof content.lng === "number" ? content.lng : 0;
    this.lat = typeof content.lat === "number" ? content.lat : 0;
    this.title = typeof content.title === "string" ? content.title : "";
    this.address = typeof content.address === "string" ? content.address : "";
    this.img = typeof content.img === "string" ? content.img : "";
  }

  encodeJSON(): Record<string, unknown> {
    return {
      lng: this.lng,
      lat: this.lat,
      title: this.title,
      address: this.address,
      img: this.img,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.location;
  }

  get conversationDigest(): string {
    return "[位置]";
  }
}
