import { MessageContent } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";

/**
 * 子区创建系统消息(对应旧 dmworkbase Messages/ThreadCreated)。
 *
 * contentType = 1100,在 system 范围(1000-2000)。但有富 payload + 点击进子区
 * 行为,所以单独 register 而不是走 SystemRenderer 兜底。
 *
 * 字段:
 *   - from_uid / from_name:创建人
 *   - thread_name:子区名
 *   - channel_id:子区 channelID(`{groupNo}____{shortId}` 4 下划线)
 *   - channel_type:子区类型(=ChannelTypeCommunityTopic=5)
 *   - short_id:子区短 ID(channel_id 解析也能拿)
 *   - last_message:最近一条预览(可选)
 *   - message_count:子区当前消息数(可选)
 */
export interface ThreadLastMessage {
  from_uid: string;
  from_name: string;
  content: string;
  timestamp: number;
}

export interface ThreadParticipant {
  uid: string;
  name: string;
}

export class ThreadCreatedContent extends MessageContent {
  content = "";
  from_uid = "";
  from_name = "";
  short_id = "";
  channel_id = "";
  channel_type = 5; // ChannelTypeCommunityTopic
  thread_name = "";
  message_count?: number;
  last_message?: ThreadLastMessage;
  participants?: ThreadParticipant[];

  decodeJSON(content: Record<string, unknown>): void {
    this.content = typeof content.content === "string" ? content.content : "";
    this.from_uid = typeof content.from_uid === "string" ? content.from_uid : "";
    this.from_name = typeof content.from_name === "string" ? content.from_name : "";
    this.short_id = typeof content.short_id === "string" ? content.short_id : "";
    this.channel_id = typeof content.channel_id === "string" ? content.channel_id : "";
    this.channel_type = typeof content.channel_type === "number" ? content.channel_type : 5;
    this.thread_name = typeof content.thread_name === "string" ? content.thread_name : "";
    this.message_count =
      typeof content.message_count === "number" ? content.message_count : undefined;
    const lm = content.last_message as Record<string, unknown> | undefined;
    if (lm && typeof lm === "object") {
      this.last_message = {
        from_uid: typeof lm.from_uid === "string" ? lm.from_uid : "",
        from_name: typeof lm.from_name === "string" ? lm.from_name : "",
        content: typeof lm.content === "string" ? lm.content : "",
        timestamp: typeof lm.timestamp === "number" ? lm.timestamp : 0,
      };
    }
    const ps = content.participants;
    if (Array.isArray(ps)) {
      this.participants = ps.map((p): ThreadParticipant => {
        const o = p as Record<string, unknown>;
        return {
          uid: typeof o.uid === "string" ? o.uid : "",
          name: typeof o.name === "string" ? o.name : "",
        };
      });
    }
  }

  encodeJSON(): Record<string, unknown> {
    return {
      content: this.content,
      from_uid: this.from_uid,
      from_name: this.from_name,
      short_id: this.short_id,
      channel_id: this.channel_id,
      channel_type: this.channel_type,
      thread_name: this.thread_name,
      message_count: this.message_count,
      last_message: this.last_message,
      participants: this.participants,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.threadCreated;
  }

  get conversationDigest(): string {
    return `${this.from_name || "有人"}创建了子区「${this.thread_name}」`;
  }
}
