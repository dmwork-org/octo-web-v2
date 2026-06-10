import { MessageContentTypeConst } from "@/features/base/im/content-types";

export interface SelectableMessageLike {
  contentType?: number;
}

/**
 * 不可多选的消息类型集合(对齐上游 `930b8fa5` UNSELECTABLE_MESSAGE_TYPES)。
 *
 * - `time` (-1):时间分割线,非真实消息
 * - `historySplit` (-3):未读分割线,non-message marker
 * - `typing` (-2):transient typing 指示,无 clientMsgNo
 * - `threadCreated` (1100):系统消息(子区创建提示),用户操作目标是子区不是消息本身
 *
 * 新增系统消息类型时同步评估是否要加入此集合,避免出现"选中后操作无意义"的状态。
 */
const UNSELECTABLE_MESSAGE_TYPES = new Set<number>([
  MessageContentTypeConst.time,
  MessageContentTypeConst.historySplit,
  MessageContentTypeConst.typing,
  MessageContentTypeConst.threadCreated,
]);

/**
 * 判定一条消息是否能被纳入多选(checkbox 显示 + row 点击 toggle 生效)。
 *
 * 不可选时:不渲染 checkbox + row 不响应点击切换 + 不进入选中集合
 * (避免后续转发/批量操作命中 system message 导致后端 400)。
 */
export function isMessageSelectable(message?: SelectableMessageLike | null): boolean {
  if (!message || typeof message.contentType !== "number") {
    return false;
  }
  return !UNSELECTABLE_MESSAGE_TYPES.has(message.contentType);
}
