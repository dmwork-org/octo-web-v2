import { MessageContent, type Message } from "wukongimjssdk";
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
 *   - title:卡片标题,如"AoLi、Thomas AI 和其他人的聊天记录"
 *   - channelType:来源会话类型(group/person)
 *   - users:涉及的用户列表
 *   - msgs:嵌套的消息列表(SDK Message 数组 — 可能本身又是 mergeForward)
 *
 * 简化(P3+ 完善):
 *   - 不做嵌套深度防护(MAX_DECODE_DEPTH 8)— 旧版有,新版后端控制深度后再加
 *   - 不重写 decode() — 默认 SDK 用 String.fromCharCode.apply 大 payload 会爆
 *     stack;暂时容忍,真出问题再改 TextDecoder 重写
 *   - msgs 里嵌套 Message 用 plain object 透传(decodeJSON 不递归构造 SDK Message
 *     实例),renderer 只读 `fromUID / digest / contentType` 用于卡片预览
 */
export class MergeforwardContent extends MessageContent {
  title = "";
  channelType = 0;
  users: MergeforwardUser[] = [];
  msgs: Message[] = [];

  decodeJSON(content: Record<string, unknown>): void {
    this.title = typeof content.title === "string" ? content.title : "";
    this.channelType = typeof content.channel_type === "number" ? content.channel_type : 0;
    this.users = Array.isArray(content.users) ? (content.users as MergeforwardUser[]) : [];
    this.msgs = Array.isArray(content.msgs) ? (content.msgs as Message[]) : [];
  }

  encodeJSON(): Record<string, unknown> {
    return {
      title: this.title,
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
