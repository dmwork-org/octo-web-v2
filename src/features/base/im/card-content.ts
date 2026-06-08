import { MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 名片消息(对应旧 dmworkbase Messages/Card):分享一个用户的名片,接收方
 * 可点击查看资料 / 加好友(本期点 → openChatProfile 弹 UserInfoModal)。
 */
export class CardContent extends MessageContent {
  name = "";
  uid = "";
  vercode = "";
  avatar = "";

  decodeJSON(content: Record<string, unknown>): void {
    this.name = typeof content.name === "string" ? content.name : "";
    this.uid = typeof content.uid === "string" ? content.uid : "";
    this.vercode = typeof content.vercode === "string" ? content.vercode : "";
    this.avatar = typeof content.avatar === "string" ? content.avatar : "";
  }

  encodeJSON(): Record<string, unknown> {
    return { name: this.name, uid: this.uid, vercode: this.vercode, avatar: this.avatar };
  }

  get contentType(): number {
    return MessageContentTypeConst.card;
  }

  get conversationDigest(): string {
    return t("message.digest.card");
  }
}
