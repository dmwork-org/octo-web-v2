import { api } from "@/features/base/api/client";
import { type Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

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

const CHANNEL_TYPE_THREAD = 5; // ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts);SDK 1.3.5 7 = ChannelTypeData,不是子区 // ChannelTypeCommunityTopic

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
  allow_no_mention: 0 | 1;
}>;

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

/** 保存到通讯录 toggle(群专用)。 */
export const setChannelSave = (channel: Channel, save: boolean) =>
  updateChannelSetting(channel, { save: save ? 1 : 0 });

/** 设置会话备注(对应旧 ChannelSettingManager.shared.remark)。 */
export const setChannelRemark = (channel: Channel, remark: string) =>
  updateChannelSetting(channel, { remark });

/**
 * 群级「允许群内 Bot 免@回答」总开关(对齐上游 ceffa569 / YUJ-3088)。
 * 两轴语义:最终免at = bot主人开了本群免at(no_mention) AND 群管理员允许本群免at(allow_no_mention)。
 * 本 helper 管的是「群管理员 allow_no_mention 轴」;服务端校验 owner/admin 权限。
 */
export const setChannelAllowNoMention = (channel: Channel, allow: boolean) =>
  updateChannelSetting(channel, { allow_no_mention: allow ? 1 : 0 });
