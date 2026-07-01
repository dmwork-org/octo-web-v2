import WKSDK, { Channel, type ChannelInfo, ChannelTypeGroup } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/**
 * 群聊状态枚举，与后端 group.GroupStatus 对齐:
 *   1 = Normal(正常)
 *   2 = Disband(已解散，企业微信式:保留历史、全员只读)
 *
 * 移植自旧仓 `dmworkbase/src/Utils/groupDisband.ts`,改为 v2 函数式(不引 class)。
 */
export const GROUP_STATUS_NORMAL = 1;
export const GROUP_STATUS_DISBAND = 2;

/** ChannelType 5 = ChannelTypeCommunityTopic(子区,对齐 thread-status.ts/parse-thread-channel-id)。 */
const CHANNEL_TYPE_THREAD = 5;

/**
 * 从 channelInfo.orgData.status 判断群是否已解散。
 *
 * status 来源:`im-callbacks.ts` channelInfoCallback 把后端 channels/{id}/{type}
 * 的 status 写入 orgData.status(见 im-callbacks.ts:260)。
 */
export function isGroupDisbanded(channelInfo?: ChannelInfo | null): boolean {
  const status = (channelInfo?.orgData as { status?: number } | undefined)?.status;
  return status === GROUP_STATUS_DISBAND;
}

/**
 * 直接按 channel 查缓存判断是否已解散(仅对群频道有意义)。
 * 缓存未命中时返回 false(fail-open,不误锁正常群)。
 */
export function isChannelDisbanded(channel?: Channel | null): boolean {
  if (!channel || channel.channelType !== ChannelTypeGroup) {
    return false;
  }
  const info = WKSDK.shared().channelManager.getChannelInfo(channel);
  return isGroupDisbanded(info);
}

/**
 * 判断「当前会话所属群」是否已解散——同时覆盖群聊与子区(CommunityTopic):
 *   - 群聊:直接看自身 status;
 *   - 子区:解散状态在父群上,需解析出父群 groupNo 再查。
 *
 * 用于会话内禁发/禁建子区等只读判定(子区也要随父群解散而只读)。
 * 父群 channelInfo 缺失时 fail-open(返回 false),不误锁。
 */
export function isConversationDisbanded(channel?: Channel | null): boolean {
  if (!channel) return false;
  if (channel.channelType === ChannelTypeGroup) {
    return isChannelDisbanded(channel);
  }
  if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (!parsed) return false;
    return isChannelDisbanded(new Channel(parsed.groupNo, ChannelTypeGroup));
  }
  return false;
}

/**
 * Composer 发送前的只读守卫(纯函数,便于直测)。
 *
 * 若当前会话(群或子区)已解散,调用 `onBlocked`(通常弹只读提示)并返回 `true`
 * 表示「应中止发送」;否则返回 `false` 放行。把守卫判定从 composer 的 send()
 * 闭包里抽出,使「解散 → 拦截发送」这一行为可被单测直接覆盖(plan §8 / P2-d),
 * 而非仅经 isConversationDisbanded 间接覆盖。
 */
export function shouldBlockDisbandedSend(
  channel: Channel | null | undefined,
  onBlocked?: () => void,
): boolean {
  if (!isConversationDisbanded(channel)) return false;
  onBlocked?.();
  return true;
}

/**
 * 对「群频道」本地权威写回解散态并触发刷新,对其它频道(个人/子区等)退回 SDK
 * 的 fetchChannelInfo(行为与原先一致)。
 *
 * 群频道为何不走 fetchChannelInfo:与 reactivateThreadInChannelInfoCache(子区归档
 * 同步)同型,规避同一 SDK 去重竞态——ChannelManager.fetchChannelInfo 对同 channelKey
 * 在途请求去重,解散瞬间若有解散前发起、携旧 status=Normal 的 fetch 在途,依赖
 * fetchChannelInfo 刷新会被旧请求 resolve 覆盖回 Normal,导致 UI 不置灰、send guard
 * 读到旧 Normal 缓存而放行发送。故群频道直接:
 *   1. 在既有 channelInfo 上原地写 orgData.status=Disband(保留 title/logo 等);
 *   2. setChannleInfoForCache 写回缓存;
 *   3. notifyListeners 触发 channelInfoListener → useChannelInfoTick 驱动重渲染置灰。
 *
 * 群频道缓存未命中(极少见)时不伪造 channelInfo(会丢字段),退回 fetchChannelInfo
 * 让 SDK 拉权威态兜底。
 */
export function syncGroupDisbandState(channel: Channel): void {
  if (!channel?.channelID) return;
  const channelManager = WKSDK.shared().channelManager;
  // 非群频道(个人/子区等):解散态只挂在群频道上,这里无直写语义,退回常规 fetch。
  if (channel.channelType !== ChannelTypeGroup) {
    void channelManager.fetchChannelInfo(channel);
    return;
  }
  const channelInfo = channelManager.getChannelInfo(channel);
  if (channelInfo) {
    const orgData = (channelInfo.orgData ?? {}) as Record<string, unknown>;
    orgData.status = GROUP_STATUS_DISBAND;
    channelInfo.orgData = orgData;
    channelManager.setChannleInfoForCache(channelInfo);
    channelManager.notifyListeners(channelInfo);
    return;
  }
  // 群频道无 live 缓存:交给 SDK 异步拉取兜底(此分支不存在可被旧请求覆盖的本地态)。
  void channelManager.fetchChannelInfo(channel);
}
