import WKSDK, { Channel, ChannelTypePerson, MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { authStore } from "@/features/base/stores/auth";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 截屏通知消息(对应旧 dmworkbase Messages/Screenshot):系统类提示,
 * "<谁> 在聊天中截屏了"。renderer 走 system-renderer 风格(居中灰字)。
 */
export class ScreenshotContent extends MessageContent {
  fromUID = "";
  fromName = "";

  decodeJSON(content: Record<string, unknown>): void {
    this.fromUID = typeof content.from_uid === "string" ? content.from_uid : "";
    this.fromName = typeof content.from_name === "string" ? content.from_name : "";
  }

  encodeJSON(): Record<string, unknown> {
    return { from_uid: this.fromUID, from_name: this.fromName };
  }

  get contentType(): number {
    return MessageContentTypeConst.screenshot;
  }

  /** 提示文案:本人 → "你",他人 → channelInfo.title or fromName。 */
  get tip(): string {
    const myUid = authStore.state.user?.uid ?? "";
    if (this.fromUID === myUid)
      return t("message.screenshot.text", { values: { name: t("message.screenshot.you") } });
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(this.fromUID, ChannelTypePerson),
    );
    const name = info?.title || this.fromName || this.fromUID;
    return t("message.screenshot.text", { values: { name } });
  }

  get conversationDigest(): string {
    return this.tip;
  }
}
