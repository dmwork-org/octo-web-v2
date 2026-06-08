import { MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * Typing 消息 content(对应旧 dmworkbase Messages/Typing/TypingContent):
 *
 *   contentType = -2(SDK 内置 transient content type,需自定义注册才能 decode)
 *
 * 字段:
 *   - fromUID:发起 typing 的用户 uid(通常 = message.fromUID,冗余存)
 *   - fromName:用户昵称(渲染层走 channelInfo,这里仅占位)
 *
 * SDK 不内置此 type;不 register 则 IM 推送的 typing packet 会被 SDK decode 阶段
 * 当作 unknown 消息 fallback,部分代码路径可能直接丢弃 → "正在回复中"不出现。
 *
 * **未实现**(对齐旧仓但本期未做):
 * - 5s/10s 自动失活(IM 持续发 typing 才视为 active)
 * - 同 channel 多个 typing 合并(收到第二条 typing 顶掉第一条)
 *   → 当前简化:typing 当普通消息进 messages 列表,跟一条普通消息一样老化(自然
 *   被后续真消息覆盖在视觉上);bot 收到回复完成后,后端通常不再发 typing,旧
 *   typing 会留在历史里但无害。
 */
export class TypingContent extends MessageContent {
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
    return MessageContentTypeConst.typing;
  }

  get conversationDigest(): string {
    return t("message.digest.typing");
  }
}
