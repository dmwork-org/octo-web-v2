import { api } from "@/features/base/api/client";
import { type Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";

/**
 * Channel 设置(对应旧 dmworkbase Service/ChannelSetting + dmworkdatasource
 * channel.updateSetting):
 *
 * 群组:        PUT /v1/groups/{groupNo}/setting body 同
 * 个人(DM):    PUT /v1/users/{uid}/setting     body 同
 * 子区(thread): PUT /v1/groups/{groupNo}/threads/{shortId}/setting body 同
 *
 * body 字段(根据需要传一项或多项):
 *   { top: 0|1, mute: 0|1, save: 0|1, invite: 0|1, remark: string,
 *     receipt: 0|1, forbidden: 0|1, allow_view_history_msg: 0|1, ... }
 */

const CHANNEL_TYPE_THREAD = 7; // ChannelTypeCommunityTopic

export type ChannelSettingBody = Partial<{
  top: 0 | 1;
  mute: 0 | 1;
  save: 0 | 1;
  invite: 0 | 1;
  remark: string;
  receipt: 0 | 1;
  forbidden: 0 | 1;
  forbidden_add_friend: 0 | 1;
  allow_view_history_msg: 0 | 1;
  allow_member_pinned_message: 0 | 1;
}>;

/** 子区 channelID 形如 `{groupNo}@{shortId}`,旧 parseThreadChannelId 同语义。 */
function parseThreadChannelId(channelId: string): { groupNo: string; shortId: string } | null {
  const at = channelId.indexOf("@");
  if (at <= 0) return null;
  return { groupNo: channelId.substring(0, at), shortId: channelId.substring(at + 1) };
}

export async function updateChannelSetting(
  channel: Channel,
  body: ChannelSettingBody,
): Promise<void> {
  if (channel.channelType === ChannelTypeGroup) {
    await api(`groups/${encodeURIComponent(channel.channelID)}/setting`, {
      method: "PUT",
      body,
    });
    return;
  }
  if (channel.channelType === ChannelTypePerson) {
    await api(`users/${encodeURIComponent(channel.channelID)}/setting`, {
      method: "PUT",
      body,
    });
    return;
  }
  if (channel.channelType === CHANNEL_TYPE_THREAD) {
    const parsed = parseThreadChannelId(channel.channelID);
    if (!parsed) return;
    await api(
      `groups/${encodeURIComponent(parsed.groupNo)}/threads/${encodeURIComponent(parsed.shortId)}/setting`,
      { method: "PUT", body },
    );
  }
}

/** 置顶 / 取消置顶。 */
export const setChannelTop = (channel: Channel, top: boolean) =>
  updateChannelSetting(channel, { top: top ? 1 : 0 });

/** 免打扰 / 关闭免打扰。 */
export const setChannelMute = (channel: Channel, mute: boolean) =>
  updateChannelSetting(channel, { mute: mute ? 1 : 0 });
