import { useEffect } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
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
import { messagesQueryKey } from "@/features/chat/queries/messages.query";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";

/**
 * 全局 IM CMD 同步(对齐老仓 module.tsx:361 全局 addCMDListener,14 种 cmd)。
 *
 * **职责**:监听 SDK 推送的命令消息,把分布式状态变化(其他端 / 服务端发起的
 * 操作)落到本地 — conversation 列表、channel 信息、头像 cache、通讯录等。
 *
 * **全局挂**:IMProvider 内 mount 一次,不依赖任何 channel 打开。老仓 module.tsx
 * 在 register 阶段全局挂同款机制;新仓 use-messages-sync 里也有 cmdListener
 * 但绑当前 channel,只覆盖 typing,其他 cmd 在没打开会话时漏接。
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
 * | messageRevoke          | 标记消息缓存 + conversation lastMessage + invalidate sidebar | 撤回后 recent 摘要同步 |
 * | friendRequest          | **skip** — 新仓 FriendApply state 模块未搬 | 后续 issue 跟进 |
 */
export function useCmdSync() {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    const invalidateContacts = () => {
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    };

    const markCachedMessageRevoked = (
      channelId: string,
      channelType: number,
      messageId: string,
      revoker: string,
    ) => {
      qc.setQueryData<InfiniteData<Message[], number>>(
        messagesQueryKey(channelId, channelType),
        (prev) => {
          if (!prev) return prev;
          let touched = false;
          for (const page of prev.pages) {
            for (const message of page) {
              if (message.messageID === messageId) {
                message.remoteExtra.revoke = true;
                message.remoteExtra.revoker = revoker;
                touched = true;
              }
            }
          }
          if (!touched) return prev;
          return { ...prev, pages: prev.pages.map((page) => [...page]) };
        },
      );
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
          let didChange = false;
          if (conv && conv.unread !== next) {
            conv.unread = next;
            cm.notifyConversationListeners(conv, ConversationAction.update);
            didChange = true;
          }
          // 关注 tab sidebar 角标快照不订阅 conversationListener,显式重 fetch。
          // **只在 unread 真改时 invalidate**(issue #84 风暴防御):server 初始时
          // 给每个 conv 推 unreadClear CMD(可能含本来就 unread=0 的会话),无脑
          // invalidate 会让 sidebar/sync 在 React Query 跨 microtask batch 失效
          // 后被打多次。
          if (didChange) {
            void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
          }
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
          avatarVersionActions.bump(groupNo, ChannelTypeGroup);
          void chm.fetchChannelInfo(new Channel(groupNo, ChannelTypeGroup));
          return;
        }

        case "userAvatarUpdate": {
          const uid = param.uid as string | undefined;
          if (!uid) return;
          avatarVersionActions.bump(uid, ChannelTypePerson);
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

        case "messageRevoke": {
          const channelId =
            (param.channel_id as string | undefined) ?? cmdMessage.channel.channelID;
          const channelType =
            typeof param.channel_type === "number"
              ? param.channel_type
              : cmdMessage.channel.channelType;
          const rawMessageId = param.message_id;
          const messageId =
            typeof rawMessageId === "string"
              ? rawMessageId
              : typeof rawMessageId === "number"
                ? String(rawMessageId)
                : undefined;
          if (!channelId || channelType == null || !messageId) return;

          const revoker = cmdMessage.fromUID;
          markCachedMessageRevoked(channelId, channelType, messageId, revoker);

          const conv = cm.findConversation(new Channel(channelId, channelType));
          if (conv?.lastMessage?.messageID === messageId) {
            conv.lastMessage.remoteExtra.revoke = true;
            conv.lastMessage.remoteExtra.revoker = revoker;
            cm.notifyConversationListeners(conv, ConversationAction.update);
            void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
          }
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
        // typing 在 use-messages-sync 处理,这里不重复。
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
