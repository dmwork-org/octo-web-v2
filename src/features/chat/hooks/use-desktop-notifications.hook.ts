import { useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Message } from "wukongimjssdk";
import { endpointStore } from "@/features/base/stores/endpoint";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { isNotificationSupported, sendNotification } from "@/features/base/lib/notification-util";

/** 子区 channelType(对齐 dmworkbase Const.ts ChannelTypeCommunityTopic)。 */
const CHANNEL_TYPE_THREAD = 5;

function extractBody(msg: Message): string {
  const content = msg.content as
    | { conversationDigest?: string; text?: string; displayText?: string }
    | undefined;
  return content?.conversationDigest || content?.displayText || content?.text || "[新消息]";
}

function iconForChannel(channel: Channel, baseURL: string): string {
  if (channel.channelType === ChannelTypePerson) {
    return `${baseURL}/users/${channel.channelID}/avatar`;
  }
  if (channel.channelType === ChannelTypeGroup || channel.channelType === CHANNEL_TYPE_THREAD) {
    return `${baseURL}/groups/${channel.channelID}/avatar`;
  }
  return "";
}

/**
 * 桌面通知钩子 — 在 IMProvider 内挂(已登录全局)。订阅 SDK chatManager onMessage,
 * 命中过滤条件后调 `sendNotification`(单条全局,5s 自动关,点击 focus + 选会话)。
 *
 * **过滤规则**(对齐老仓 NotificationUtil.sendMessageNotification + module.tsx L537):
 *   1. 自己发的(`fromUID === uid`)
 *   2. SDK header.noPersist(瞬态如 typing)
 *   3. SDK header.reddot=false(后端不展角标的消息)
 *   4. 当前正在打开的会话(`chatSelectedStore.channel.isEqual`)
 *   5. channelInfo.mute(免打扰)
 *   6. 子区:父群 mute(parentGroupNo 路径)
 *   7. notification-util 全局 off flag(用户在 settings 关了)
 *   8. document.visibilityState === 'visible'(用户在用,不打扰)
 *
 * 4 / 7 / 8 由 sendNotification 内部检 / store 即时读;其余在本 hook 拦截。
 */
export function useDesktopNotifications(uid: string | null) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);

  useEffect(() => {
    if (!uid) return;
    if (!isNotificationSupported()) return;

    const onMessage = (msg: Message) => {
      // 1. 自己发的
      if (msg.fromUID === uid) return;
      // 2-3. 不持久化 / 不显红点的消息
      if (msg.header?.noPersist) return;
      if (!msg.header?.reddot) return;
      // 4. 当前会话
      const current = chatSelectedStore.state.channel;
      if (current && current.isEqual(msg.channel)) return;
      // 5. 频道免打扰
      const info = WKSDK.shared().channelManager.getChannelInfo(msg.channel);
      if (info?.mute) return;
      // 6. 子区:父群免打扰
      const parentNo = (info?.orgData as { parentGroupNo?: string } | undefined)?.parentGroupNo;
      if (parentNo) {
        const parent = new Channel(parentNo, ChannelTypeGroup);
        const parentInfo = WKSDK.shared().channelManager.getChannelInfo(parent);
        if (parentInfo?.mute) return;
      }

      const title =
        info?.title ||
        (info?.orgData as { displayName?: string } | undefined)?.displayName ||
        msg.channel.channelID;
      const body = extractBody(msg);
      const icon = iconForChannel(msg.channel, baseURL);

      sendNotification({
        title,
        body,
        icon,
        tag: "message",
        onClick: () => chatSelectedActions.select(msg.channel),
      });
    };

    WKSDK.shared().chatManager.addMessageListener(onMessage);
    return () => {
      WKSDK.shared().chatManager.removeMessageListener(onMessage);
    };
  }, [uid, baseURL]);
}
