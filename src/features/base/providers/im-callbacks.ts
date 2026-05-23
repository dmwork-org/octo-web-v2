import WKSDK, {
  Channel,
  ChannelInfo,
  type Conversation,
  type Message,
  type Subscriber,
} from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import {
  syncConversations,
  syncChannelMessages,
} from "@/features/base/api/endpoints/conversation.api";
import { getChannelInfoRaw } from "@/features/base/api/endpoints/channel.api";
import { rawToConversation, rawToMessage } from "@/features/base/im/convert";
import { MediaMessageUploadTask } from "@/features/base/im/upload-task";

/**
 * 注册 SDK provider 必须的 callback(否则 conversationManager.sync /
 * chatManager.syncMessages 等会抛 TypeError)。
 *
 * 对应旧项目 `packages/dmworkdatasource/src/module.ts` 的 set*Callback 系列。
 * 覆盖让"会话列表 + 消息历史 + 上传 + 已读" 跑起来的集合:
 *   - syncConversationsCallback     → POST conversation/sync,转 raw → Conversation
 *                                     完成后批量 fetchChannelInfo 让标题显示真名
 *   - channelInfoCallback           → GET channels/{id}/{type},转 raw → ChannelInfo
 *   - syncSubscribersCallback       → 返回空数组兜底(P3 群成员功能再补)
 *   - syncMessagesCallback          → POST message/channel/sync,转 raw → Message(完整版)
 *   - messageReadedCallback         → no-op,P2-B12 接 POST message/readed
 *   - messageUploadTaskCallback     → MediaMessageUploadTask(P2-B6,COS 直传)
 *
 * 幂等:多次调安全(SDK 内部直接覆盖 callback)。在 IMProvider mount 时调一次。
 */
export function registerImCallbacks(): void {
  const provider = WKSDK.shared().config.provider;

  provider.syncConversationsCallback = async () => {
    const spaceId = spaceStore.state.spaceId || undefined;
    const resp = await syncConversations(spaceId);
    const conversations: Conversation[] = (resp.conversations ?? []).map(rawToConversation);
    // 异步批量拉 channelInfo,让列表显示真实标题(无需 await)。
    // SDK channelManager.fetchChannelInfo 内部会去重 + 触发 channelInfoListener,
    // useConversationsSync 收到 listener 后 setQueryData 重渲列表。
    for (const conv of conversations) {
      void WKSDK.shared().channelManager.fetchChannelInfo(conv.channel);
    }
    return conversations;
  };

  provider.channelInfoCallback = async (channel: Channel): Promise<ChannelInfo> => {
    const info = new ChannelInfo();
    info.channel = channel;
    try {
      const raw = await getChannelInfoRaw(channel.channelID, channel.channelType);
      info.title = raw.remark && raw.remark !== "" ? raw.remark : (raw.name ?? channel.channelID);
      info.mute = raw.mute === 1;
      info.top = raw.stick === 1;
      info.online = raw.online === 1;
      info.lastOffline = raw.last_offline ?? 0;
      info.logo = raw.logo ?? "";
      info.orgData = {
        ...raw.extra,
        remark: raw.remark ?? "",
        displayName: raw.remark && raw.remark !== "" ? raw.remark : (raw.name ?? ""),
        notice: raw.notice,
      };
    } catch {
      // 404 / 无权限:返回空 title 占位,避免渲染 channelID hex
      info.title = "";
      info.orgData = {};
    }
    return info;
  };

  provider.syncSubscribersCallback = async (): Promise<Subscriber[]> => {
    // P3: 接 groups/{id}/membersync。P2 第一版兜底空数组,IM 主路径不需要成员列表。
    return [];
  };

  provider.syncMessagesCallback = async (channel, opts): Promise<Message[]> => {
    const resp = await syncChannelMessages({
      channel_id: channel.channelID,
      channel_type: channel.channelType,
      start_message_seq: opts.startMessageSeq ?? 0,
      end_message_seq: opts.endMessageSeq ?? 0,
      limit: opts.limit ?? 30,
      pull_mode: opts.pullMode ?? 0,
    });
    return (resp.messages ?? []).map(rawToMessage);
  };

  provider.messageReadedCallback = async () => {
    // P2-B12 接 POST message/readed
  };

  provider.messageUploadTaskCallback = (msg: Message) => new MediaMessageUploadTask(msg);
}
