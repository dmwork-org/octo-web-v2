/**
 * 撤回权限判定 — 1:1 对齐老仓 dmworkbase Service/revokePermission.ts。
 *
 * 纯函数,不依赖 React / WKSDK。caller 负责从 SDK 拿 myRole / targetRole 等上下文
 * 再传入,便于独立测试。
 *
 * 权限矩阵:
 *   - 缺 messageID                 → false(系统消息 / 本地未持久)
 *   - bot 创建者撤自家 bot          → true(无时间窗口)
 *   - 群/子区 owner                → true(无时间窗口)
 *   - 群/子区 manager 撤自己消息   → 走时间窗口
 *   - 群/子区 manager 撤别人消息   → 仅当 target 非 owner/manager;target 角色未知 → false(由
 *                                    caller 预热,下次 menu 再判)
 *   - 普通成员 / 非群聊             → 仅能撤自己消息且在时间窗口内
 */

/** ChannelTypeGroup 来自 wukongimjssdk;ChannelTypeCommunityTopic(子区)= 5。 */
const CHANNEL_TYPE_GROUP = 2;
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

export const GroupRole = {
  normal: 0,
  owner: 1,
  manager: 2,
} as const;

export interface RevokeMenuPermissionInput {
  messageID?: string;
  channelType?: number;
  /** 是否自己发的消息(WKSDK Message.send) */
  messageSend?: boolean;
  /** 消息时间戳(秒) */
  messageTimestamp?: number;
  /** 撤回时间窗口(秒);0 或负数视为不限制 */
  revokeSecond?: number;
  /** 当前时间(秒),默认 Date.now()/1000;测试用 */
  nowSeconds?: number;
  /** sender 是 bot 且 bot 由当前用户创建 */
  isBotOwner?: boolean;
  /** 当前用户在 group/thread 父群中的角色 */
  myRole?: number;
  /** 被撤回者在 group/thread 父群中的角色(仅 manager 撤他人时需要) */
  targetRole?: number;
}

export function isWithinRevokeWindow(input: {
  messageTimestamp?: number;
  revokeSecond?: number;
  nowSeconds?: number;
}): boolean {
  const revokeSecond = input.revokeSecond ?? 0;
  if (revokeSecond <= 0) return true;
  const messageTimestamp = input.messageTimestamp ?? 0;
  const nowSeconds = input.nowSeconds ?? Date.now() / 1000;
  return nowSeconds - messageTimestamp <= revokeSecond;
}

export function canShowRevokeMenu(input: RevokeMenuPermissionInput): boolean {
  if (!input.messageID) return false;

  if (input.isBotOwner) return true;

  const isGroupLike =
    input.channelType === CHANNEL_TYPE_GROUP || input.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC;

  if (isGroupLike) {
    if (input.myRole === GroupRole.owner) return true;

    if (input.myRole === GroupRole.manager) {
      // manager 撤自己消息 → 走时间窗(对齐老仓)
      if (input.messageSend) return isWithinRevokeWindow(input);

      // manager 撤别人消息 → target 角色未知时 caller 应异步预热,本次返回 false
      if (input.targetRole == null) return false;

      return input.targetRole !== GroupRole.owner && input.targetRole !== GroupRole.manager;
    }

    // 普通成员只能撤自己
    if (!input.messageSend) return false;
  } else if (!input.messageSend) {
    // 非群聊(私聊等)只能撤自己
    return false;
  }

  return isWithinRevokeWindow(input);
}
