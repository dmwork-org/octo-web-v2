import WKSDK, { type Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { channelSpaceKey, channelSpaceMap } from "@/features/base/stores/space";

/**
 * 判断 channel 是否归属当前 Space(1:1 对齐旧 dmworkbase
 * `Service/SpaceService.ts::shouldSkipChannelForSpace` 的反向语义,
 * `true` = 允许显示;`false` = 应过滤掉)。
 *
 * **3 层判定**(由强到弱):
 *   1. `channelSpaceMap`(由 syncConversations 预填) — 命中即按 owner 匹配
 *   2. SDK `channelManager.getChannelInfo(channel).orgData.space_id` —
 *      命中后**回填** channelSpaceMap 避免下次重查
 *   3. 都未命中 → **fail-open**(乐观保留,等 channelInfo 异步到位 listener 触发
 *      重渲时 第 2 层会兜住)
 *
 * **类型特殊处理**:
 *   - Person 私聊 → 永远 allow(私聊不归属 Space,旧仓兼容;系统 Bot 单独走
 *     `isMessageOfSpace` 用 contentObj.space_id 判定)
 *   - **外部成员**(`subscriber.orgData.source_space_id === spaceId`)— 群归属
 *     其他 Space 但用户以当前 Space 身份加入,也 allow。新仓暂未做(覆盖率低,
 *     需要 subscriber 全量缓存),留 TODO
 *
 * 入参 `spaceId = null` → 跳过过滤(无 Space 上下文,全部 allow)。
 */
export function isChannelOfSpace(channel: Channel, spaceId: string | null): boolean {
  if (!spaceId) return true;
  if (!channel?.channelID) return true;
  if (channel.channelType === ChannelTypePerson) return true;

  if (channel.channelType === ChannelTypeGroup) {
    const key = channelSpaceKey(channel.channelID, channel.channelType);
    const cached = channelSpaceMap.get(key);
    if (cached) return cached === spaceId;

    // fallback:从 SDK channelInfo cache 取 space_id,命中后回填
    const info = WKSDK.shared().channelManager.getChannelInfo(channel);
    const orgSpace = (info?.orgData as { space_id?: string } | undefined)?.space_id;
    if (orgSpace) {
      channelSpaceMap.set(key, orgSpace);
      return orgSpace === spaceId;
    }
    // 都未命中 → fail-open(等异步 channelInfoListener 到位,下次 snapshot 自动矫正)
  }

  return true;
}
