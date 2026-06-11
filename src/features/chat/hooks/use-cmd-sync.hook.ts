import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  type CMDContent,
  ConversationAction,
  type Message,
} from "wukongimjssdk";
import { avatarVersionActions } from "@/features/base/stores/avatar-version";
import { spaceStore } from "@/features/base/stores/space";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";

/**
 * 全局 IM CMD 同步(对齐老仓 module.tsx:361 全局 addCMDListener,14 种 cmd)。
 *
 * **职责**:监听 SDK 推送的命令消息,把分布式状态变化(其他端 / 服务端发起的
 * 操作)落到本地 — conversation 列表、channel 信息、头像 cache、通讯录等。
 *
 * **全局挂**:IMProvider 内 mount 一次,不依赖任何 channel 打开。老仓 module.tsx
 * 在 register 阶段全局挂同款机制;新仓 use-messages-sync 里也有 cmdListener
 * 但绑当前 channel,只覆盖 typing/messageRevoke,其他 cmd 在没打开会话时漏接。
 *
 * **cmd 对照表**(对齐老仓 module.tsx L361-505):
 *
 * | cmd                    | 新仓处理 | 备注 |
 * |------------------------|----------|------|
 * | unreadClear            | conv.unread = next + notify + invalidate sidebar | issue #60 |
 * | channelUpdate          | fetchChannelInfo → 触发 channelInfoListener | 群名/设置变更 |
 * | groupAvatarUpdate      | avatarVersion.bump + fetchChannelInfo | 头像换 version 绕浏览器 cache |
 * | userAvatarUpdate       | avatarVersion.bump + invalidate contacts | 用户头像换 version |
 * | conversationDeleted    | conversationManager.removeConversation | SDK 自动 notify |
 * | memberUpdate           | channelManager.syncSubscribes | 群成员变更 |
 * | onlineStatus           | 改 channelInfo.online + notifyListeners | 好友上下线 |
 * | syncConversationExtra  | conversationManager.syncExtra | 会话扩展同步 |
 * | syncReminders          | reminderManager.sync | @我 / 入群申请等 reminder 增量拉 |
 * | friendAccept           | fetchChannelInfo(对方) + invalidate contacts | 通讯录刷 |
 * | friendDeleted          | invalidate contacts | 通讯录刷 |
 * | typing                 | (use-messages-sync 已处理) | 绑 channel 合理 |
 * | messageRevoke          | (use-messages-sync 已处理) | 绑 channel 合理 |
 * | friendRequest          | **skip** — 新仓 FriendApply state 模块未搬 | 后续 issue 跟进 |
 */
export function useCmdSync() {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    const invalidateContacts = () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    };

    const cmdListener = (cmdMessage: Message) => {
      const cmd = cmdMessage.content as CMDContent;
      const param = (cmd.param ?? {}) as Record<string, unknown>;
      const cm = WKSDK.shared().conversationManager;
      const chm = WKSDK.shared().channelManager;

      switch (cmd.cmd) {
        case "unreadClear": {
          const channelId = param.channel_id as string | undefined;
          const channelType = param.channel_type as number | undefined;
          if (!channelId || channelType == null) return;
          const channel = new Channel(channelId, channelType);
          const conv = cm.findConversation(channel);
          const rawUnread = param.unread as number | undefined;
          const next = rawUnread && rawUnread > 0 ? rawUnread : 0;
          if (conv && conv.unread !== next) {
            conv.unread = next;
            cm.notifyConversationListeners(conv, ConversationAction.update);
          }
          // 关注 tab sidebar 角标快照不订阅 conversationListener,显式重 fetch
          void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
          return;
        }

        case "channelUpdate": {
          const channelId = param.channel_id as string | undefined;
          const channelType = param.channel_type as number | undefined;
          if (!channelId || channelType == null) return;
          void chm.fetchChannelInfo(new Channel(channelId, channelType));
          return;
        }

        case "groupAvatarUpdate": {
          const groupNo = param.group_no as string | undefined;
          if (!groupNo) return;
          avatarVersionActions.bump(groupNo);
          void chm.fetchChannelInfo(new Channel(groupNo, ChannelTypeGroup));
          return;
        }

        case "userAvatarUpdate": {
          const uid = param.uid as string | undefined;
          if (!uid) return;
          avatarVersionActions.bump(uid);
          invalidateContacts();
          return;
        }

        case "conversationDeleted": {
          const channelId = param.channel_id as string | undefined;
          const channelType = param.channel_type as number | undefined;
          if (!channelId || channelType == null) return;
          cm.removeConversation(new Channel(channelId, channelType));
          return;
        }

        case "memberUpdate": {
          const groupNo = param.group_no as string | undefined;
          if (!groupNo) return;
          void chm.syncSubscribes(new Channel(groupNo, ChannelTypeGroup));
          return;
        }

        case "onlineStatus": {
          const uid = param.uid as string | undefined;
          if (!uid) return;
          const online = (param.online as number | undefined) === 1;
          const channel = new Channel(uid, ChannelTypePerson);
          const info = chm.getChannelInfo(channel);
          if (info) {
            info.online = online;
            if (!online) info.lastOffline = Date.now() / 1000;
            chm.notifyListeners(info);
          } else {
            void chm.fetchChannelInfo(channel);
          }
          return;
        }

        case "syncConversationExtra": {
          void cm.syncExtra();
          return;
        }

        case "syncReminders": {
          // 触发 SDK reminderManager 增量拉取(对齐老仓 module.tsx:485
          // `WKSDK.shared().reminderManager.sync()`)。server 推 syncReminders CMD
          // 通常发生在新 @我 / 入群申请等场景,客户端不主动拉就漏接:
          // - "老仓 @所有人会有@我,新仓没有"的真凶 —— server 给 broadcast 推了
          //   reminder,新仓没 sync 拿不到 → conv.reminders 空 → isMentionMe false
          void WKSDK.shared().reminderManager.sync();
          return;
        }

        case "friendAccept": {
          const toUID = param.to_uid as string | undefined;
          const fromUID = param.from_uid as string | undefined;
          if (!toUID) return;
          if (fromUID) {
            void chm.fetchChannelInfo(new Channel(fromUID, ChannelTypePerson));
          }
          invalidateContacts();
          return;
        }

        case "friendDeleted": {
          invalidateContacts();
          return;
        }

        // friendRequest 见上方对照表 — 新仓 FriendApply state 模块未搬,留空。
        // typing / messageRevoke 在 use-messages-sync 处理,这里不重复。
        default:
          return;
      }
    };

    WKSDK.shared().chatManager.addCMDListener(cmdListener);
    return () => {
      WKSDK.shared().chatManager.removeCMDListener(cmdListener);
    };
  }, [qc, spaceId]);
}
