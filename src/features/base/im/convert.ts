import WKSDK, {
  Channel,
  Conversation,
  Message,
  MessageExtra,
  MessageStatus,
  Setting,
} from "wukongimjssdk";
import type {
  ConversationRaw,
  MessageExtraRaw,
  MessageRaw,
} from "@/features/base/api/endpoints/conversation.api";

/**
 * raw 服务端 JSON → SDK 实例转换层(对应旧项目 packages/dmworkbase/src/Service/Convert.ts)。
 *
 * 重要约束:
 * - SDK Message / Conversation / MessageExtra 是 mutable class 实例;query cache
 *   消费方按引用对比触发 re-render(structuralSharing:false 已开)。
 * - message_id 用 `String()` 转换,会丢 long int 精度 — 旧项目也有同样问题
 *   (BigNumber 在拿到 number 后才转,精度已在 JSON.parse 时丢)。后续按需引
 *   lossless-json。
 * - 外部群字段(from_is_external 等)以 snake_case 动态挂在 Message 实例上,消费方按
 *   `(message as any).from_is_external` 读;不写 TS 类型(旧项目同样做法)。
 */

type ExternalFields = {
  from_is_external?: number;
  from_source_space_name?: string;
  from_home_space_id?: string;
  from_home_space_name?: string;
};

/**
 * 把 wire 上的 from_* 外部群字段透传到 Message / Reply 实例。
 * 仅做字段拷贝,不修 resolver。对应旧项目 applyMsgLevelExternalFields。
 */
function applyExternalFields(target: object, raw: MessageRaw): void {
  const t = target as ExternalFields;
  if (raw.from_is_external !== undefined && raw.from_is_external !== null) {
    t.from_is_external = raw.from_is_external === 1 ? 1 : 0;
  }
  if (raw.from_source_space_name) t.from_source_space_name = raw.from_source_space_name;
  if (raw.from_home_space_id) t.from_home_space_id = raw.from_home_space_id;
  if (raw.from_home_space_name) t.from_home_space_name = raw.from_home_space_name;
}

/** raw payload(JSON 对象,含 type 字段)→ SDK MessageContent 实例。 */
function decodePayload(message: Message, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const obj = payload as { type?: number };
  const contentType = typeof obj.type === "number" ? obj.type : 0;
  const content = WKSDK.shared().getMessageContent(contentType);
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  content.decode(bytes);
  message.content = content;
}

/** raw → SDK MessageExtra(对应旧 toMessageExtra)。 */
export function rawToMessageExtra(raw: MessageExtraRaw): MessageExtra {
  const ext = new MessageExtra();
  ext.messageID = raw.message_id_str ?? String(raw.message_id ?? "");
  ext.messageSeq = raw.message_seq ?? 0;
  ext.readed = raw.readed === 1;
  if (raw.readed_at && raw.readed_at > 0) ext.readedAt = new Date(raw.readed_at);
  ext.readedCount = raw.readed_count ?? 0;
  ext.unreadCount = raw.unread_count ?? 0;
  ext.revoke = raw.revoke === 1;
  if (raw.revoker) ext.revoker = raw.revoker;
  ext.extraVersion = raw.extra_version ?? 0;
  ext.editedAt = raw.edited_at ?? 0;
  ext.isEdit = raw.is_edit === 1;
  ext.extra = raw.extra;
  if (raw.content_edit) {
    const editType = typeof raw.content_edit.type === "number" ? raw.content_edit.type : 0;
    const content = WKSDK.shared().getMessageContent(editType);
    const bytes = new TextEncoder().encode(JSON.stringify(raw.content_edit));
    content.decode(bytes);
    ext.contentEditData = bytes;
    ext.contentEdit = content;
  }
  return ext;
}

/** raw → SDK Message(完整版,对应旧 toMessage)。 */
export function rawToMessage(raw: MessageRaw): Message {
  const msg = new Message();
  msg.messageID = raw.message_idstr ?? String(raw.message_id ?? "");
  msg.channel = new Channel(raw.channel_id, raw.channel_type);
  msg.messageSeq = raw.message_seq ?? 0;
  msg.clientSeq = raw.client_seq ?? 0;
  msg.clientMsgNo = raw.client_msg_no ?? "";
  msg.fromUID = raw.from_uid;
  msg.timestamp = raw.timestamp;
  msg.status = MessageStatus.Normal;
  msg.isDeleted = raw.is_deleted === 1;

  if (raw.header) msg.header.reddot = raw.header.red_dot === 1;
  if (typeof raw.setting === "number") {
    msg.setting = Setting.fromUint8(raw.setting);
  }
  if (raw.revoke === 1) msg.remoteExtra.revoke = true;
  if (raw.message_extra) msg.remoteExtra = rawToMessageExtra(raw.message_extra);

  decodePayload(msg, raw.payload);
  applyExternalFields(msg, raw);
  return msg;
}

/** raw → SDK Conversation(完整版,recents[0] 用 rawToMessage 转 lastMessage)。 */
export function rawToConversation(raw: ConversationRaw): Conversation {
  const conv = new Conversation();
  conv.channel = new Channel(raw.channel_id, raw.channel_type);
  conv.unread = raw.unread ?? 0;
  conv.timestamp = raw.timestamp ?? 0;
  conv.extra = {
    top: raw.stick ?? 0,
    categoryId: raw.category_id ?? null,
    categorySort: raw.category_sort ?? 0,
    spaceUnread: raw.space_unread,
  };
  const lastRaw = raw.recents?.[0] as MessageRaw | undefined;
  if (lastRaw) conv.lastMessage = rawToMessage(lastRaw);
  return conv;
}
