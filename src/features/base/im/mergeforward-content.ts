import WKSDK, { Message, MessageContent } from "wukongimjssdk";
import { t } from "@/lib/i18n/instance";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 合并转发用户(对应旧 dmworkbase MergeforwardUser):
 *   uid + name 必填;is_external / source_space_name 给跨 Space 转发标记。
 */
export interface MergeforwardUser {
  uid: string;
  name: string;
  is_external?: number;
  source_space_name?: string;
}

/**
 * 合并转发消息 content(对应旧 dmworkbase Messages/Mergeforward):
 *
 *   - channelType:来源会话类型(group=2 / person=1)
 *   - users:涉及的用户列表(用于 title 拼接 + sender 名查找)
 *   - msgs:嵌套消息(**SDK Message 实例**,已通过 mapToMessage 完整 decode,
 *     包括 type=11 嵌套合并转发也是 MergeforwardContent 实例)
 *
 * **没有 title 字段** — 旧版 title 是渲染期 derive:
 *   - group → 固定"群的聊天记录"
 *   - person → "NAME1、NAME2 的聊天记录"
 *
 * 嵌套 decode 通过 mapToMessage:payload obj → JSON.stringify → TextEncoder
 * → SDK getMessageContent(type).decode(bytes) 实例化(对齐旧 Mergeforward
 * index.tsx:168-195 mapToMessage)。
 */
export class MergeforwardContent extends MessageContent {
  channelType = 0;
  users: MergeforwardUser[] = [];
  msgs: Message[] = [];

  decodeJSON(content: Record<string, unknown>): void {
    this.channelType = typeof content.channel_type === "number" ? content.channel_type : 0;
    const rawUsers = Array.isArray(content.users) ? (content.users as MergeforwardUser[]) : [];
    // 去重(对齐旧版,后端偶发重复)
    const seen = new Set<string>();
    this.users = rawUsers.filter((u) => {
      if (!u?.uid || seen.has(u.uid)) return false;
      seen.add(u.uid);
      return true;
    });
    const rawMsgs = Array.isArray(content.msgs)
      ? (content.msgs as Array<Record<string, unknown>>)
      : [];
    this.msgs = rawMsgs.map((m) => mapToMessage(m));
  }

  encodeJSON(): Record<string, unknown> {
    return {
      channel_type: this.channelType,
      users: this.users,
      msgs: this.msgs.map((m) => messageToMap(m)),
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.mergeForward;
  }

  get conversationDigest(): string {
    return t("mergeForward.digest");
  }
}

/**
 * 把后端 raw msg map 反序列化成 SDK Message 实例(对齐旧 mapToMessage line 168-195)。
 *
 * 流程:
 * 1. 创建 Message,填 messageID / timestamp / fromUID
 * 2. 取 payload.type → getMessageContent(type) 拿 MessageContent 实例
 * 3. payload obj → JSON.stringify → TextEncoder bytes → content.decode(bytes)
 *    这样嵌套 MergeforwardContent 也会递归 decode(因为 MergeforwardContent.decode
 *    会再调它的 decodeJSON,继续走 mapToMessage)
 * 4. message.content = content
 */
function mapToMessage(raw: Record<string, unknown>): Message {
  const m = new Message();
  m.messageID = raw.message_id != null ? String(raw.message_id) : "";
  m.timestamp = typeof raw.timestamp === "number" ? raw.timestamp : 0;
  m.fromUID = typeof raw.from_uid === "string" ? raw.from_uid : "";
  const payloadObj = (raw.payload as Record<string, unknown> | undefined) ?? {};
  const contentType = typeof payloadObj.type === "number" ? payloadObj.type : 0;
  const content = WKSDK.shared().getMessageContent(contentType);
  const bytes = new TextEncoder().encode(JSON.stringify(payloadObj));
  content.decode(bytes);
  m.content = content;
  return m;
}

/** 反向:Message 实例 → raw map(encode 时用,与 mapToMessage 对称)。 */
function messageToMap(m: Message): Record<string, unknown> {
  const content = m.content;
  const payload = (content as unknown as { contentObj?: Record<string, unknown> }).contentObj ?? {
    ...content.encodeJSON(),
    type: content.contentType,
  };
  return {
    message_id: m.messageID,
    timestamp: m.timestamp,
    from_uid: m.fromUID,
    payload,
  };
}
