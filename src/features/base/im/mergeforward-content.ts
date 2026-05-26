import { MessageContent } from "wukongimjssdk";
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
 * 合并转发里嵌套的单条消息(后端 raw payload,snake case)。
 *
 * 字段对齐旧 dmworkbase mapToMessage 的源端 messageMap:
 *   - message_id:消息 ID(可能是数字或字符串)
 *   - from_uid:发送者 uid
 *   - timestamp:发送时间
 *   - payload:嵌套 content(有 type 字段 + 具体 content/text/url 等)
 *
 * 不实例化为 SDK Message — renderer 只用前 4 条做 digest 预览,直接读 raw 即可。
 */
export interface MergeforwardInnerMsg {
  message_id?: string | number;
  from_uid?: string;
  timestamp?: number;
  payload?: {
    type?: number;
    content?: string;
    text?: string;
    name?: string;
    [k: string]: unknown;
  };
}

/**
 * 合并转发消息 content(对应旧 dmworkbase Messages/Mergeforward):
 *
 *   - channel_type:来源会话类型(group=2 / person=1)
 *   - users:涉及的用户列表(用于 title 拼接 + sender 名查找)
 *   - msgs:嵌套消息 raw payload 数组
 *
 * **没有 title 字段** — 旧版 title 是渲染期 derive(getTitle):
 *   - group → 固定"群的聊天记录"
 *   - person → "NAME1、NAME2 的聊天记录"
 *
 * 简化(对齐旧版差异):
 * - 不做 decode 深度防护(MAX_DECODE_DEPTH 8)— 旧版有,后端深度可控后再加
 * - 不重写 decode() 用 TextDecoder — 大 payload 默认 String.fromCharCode.apply
 *   stack overflow,真出问题再改
 * - msgs 不实例化 SDK Message — renderer 直接读 raw payload type → digest 文字
 */
export class MergeforwardContent extends MessageContent {
  channelType = 0;
  users: MergeforwardUser[] = [];
  msgs: MergeforwardInnerMsg[] = [];

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
    this.msgs = Array.isArray(content.msgs) ? (content.msgs as MergeforwardInnerMsg[]) : [];
  }

  encodeJSON(): Record<string, unknown> {
    return {
      channel_type: this.channelType,
      users: this.users,
      msgs: this.msgs,
    };
  }

  get contentType(): number {
    return MessageContentTypeConst.mergeForward;
  }

  get conversationDigest(): string {
    return "[聊天记录]";
  }
}
