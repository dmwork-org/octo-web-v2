import { useEffect } from "react";
import WKSDK, { Channel, ChannelTypeGroup, type Message } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** CHANNEL_TYPE_COMMUNITY_TOPIC = 5(子区);ChannelTypeGroup = 2。 */
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

/**
 * 撤回菜单需要按"撤回者 vs 被撤回者"角色判定权限(对齐老仓
 * `dmworkbase/Service/revokePermission.ts`)。SDK 缓存有 subscribers 才能同步读出
 * `myRole` / `targetRole`,所以进入 group/thread 会话时主动 syncSubscribes 一次预热。
 *
 * 子区(thread)的角色取**父群**成员,不是子区自身(子区成员未同步),与
 * `lib/thread-permission.ts` 一致。
 *
 * 不监听 subscriber 变更(变更概率低,变了后下一次菜单计算自然走新缓存);
 * 不返回数据(只副作用预热),所以不会触发 message-row 重渲。
 */
export function useEnsureRoleSubscribersForRevoke(channel: Channel | null) {
  useEffect(() => {
    if (!channel) return;
    const cm = WKSDK.shared().channelManager;
    if (channel.channelType === ChannelTypeGroup) {
      void cm.syncSubscribes(channel);
      return;
    }
    if (channel.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC) {
      const parsed = parseThreadChannelId(channel.channelID);
      if (parsed?.groupNo) {
        void cm.syncSubscribes(new Channel(parsed.groupNo, ChannelTypeGroup));
      }
    }
  }, [channel?.channelID, channel?.channelType]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * 给定消息所在 channel(group / thread),返回**用于权限判定的 channel**:
 * - group  → 自身
 * - thread → 父群(子区角色继承父群)
 * - 其他   → null(私聊等不需要 role)
 */
export function resolveRoleChannel(channel: Channel): Channel | null {
  if (channel.channelType === ChannelTypeGroup) return channel;
  if (channel.channelType === CHANNEL_TYPE_COMMUNITY_TOPIC) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (parsed?.groupNo) return new Channel(parsed.groupNo, ChannelTypeGroup);
  }
  return null;
}

/** SDK subscriber 的 role 字段可能在 orgData.role 或顶层 role,对齐 thread-permission。 */
function readRole(
  subscriber: { role?: number; orgData?: unknown } | undefined,
): number | undefined {
  if (!subscriber) return undefined;
  const fromOrg = (subscriber.orgData as { role?: number } | undefined)?.role;
  return fromOrg ?? subscriber.role;
}

/** 同步读 uid 在 roleChannel 的角色;缺则返回 undefined(由 caller 触发 warm)。 */
export function getRoleSync(roleChannel: Channel | null, uid: string): number | undefined {
  if (!roleChannel || !uid) return undefined;
  const subs = WKSDK.shared().channelManager.getSubscribes(roleChannel);
  return readRole(subs?.find((s) => s.uid === uid));
}

/** 异步预热 targetRole(对齐老仓 warmRevokeTargetRole);多次调用 SDK 内部去重。 */
export function warmRoleSubscribers(roleChannel: Channel | null): void {
  if (!roleChannel) return;
  void WKSDK.shared().channelManager.syncSubscribes(roleChannel);
}

/**
 * 收集撤回判定所需上下文。供 message-row.tsx 在计算 revokeAllowed 时调用,
 * 同步返回 myRole + targetRole(若需要)。targetRole 缺失时触发 warm,下次重算命中。
 */
export function collectRevokeRoleContext(
  message: Message,
  myUid: string,
): { roleChannel: Channel | null; myRole: number | undefined; targetRole: number | undefined } {
  const roleChannel = resolveRoleChannel(message.channel);
  const myRole = getRoleSync(roleChannel, myUid);
  let targetRole: number | undefined;
  if (myRole === 2 /* manager */ && !message.send) {
    targetRole = getRoleSync(roleChannel, message.fromUID);
    if (targetRole == null) {
      warmRoleSubscribers(roleChannel);
    }
  }
  return { roleChannel, myRole, targetRole };
}
