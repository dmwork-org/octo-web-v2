import WKSDK, {
  Channel,
  ChannelInfo,
  Conversation,
  type Message,
  type Subscriber,
} from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import {
  syncConversations,
  syncChannelMessages,
} from "@/features/base/api/endpoints/conversation.api";
import { getChannelInfoRaw } from "@/features/base/api/endpoints/channel.api";

/**
 * 注册 SDK provider 必须的 callback(否则 conversationManager.sync /
 * chatManager.syncMessages 等会抛 TypeError)。
 *
 * 对应旧项目 `packages/dmworkdatasource/src/module.ts` 的 set*Callback 系列。
 * 第一版只覆盖让"会话列表 + 消息历史" 跑起来的最小集:
 *   - syncConversationsCallback     → POST conversation/sync,转 raw → Conversation
 *   - channelInfoCallback           → GET channels/{id}/{type},转 raw → ChannelInfo
 *   - syncSubscribersCallback       → 返回空数组兜底(P3 群成员功能再补)
 *   - syncMessagesCallback          → POST message/channel/sync,转 raw → Message
 *   - messageReadedCallback         → no-op,P3 未读已读功能再补
 *
 * 幂等:多次调安全(SDK 内部直接覆盖 callback)。在 IMProvider mount 时调一次。
 */
export function registerImCallbacks(): void {
  const provider = WKSDK.shared().config.provider;

  provider.syncConversationsCallback = async () => {
    const spaceId = spaceStore.state.spaceId || undefined;
    const resp = await syncConversations(spaceId);
    const conversations: Conversation[] = [];
    for (const raw of resp.conversations ?? []) {
      const conv = new Conversation();
      conv.channel = new Channel(raw.channel_id, raw.channel_type);
      conv.unread = raw.unread ?? 0;
      conv.timestamp = raw.timestamp ?? 0;
      conv.extra = {
        top: raw.stick ?? 0,
        categoryId: raw.category_id ?? null,
        categorySort: raw.category_sort ?? 0,
        spaceUnread: raw.space_unread,
      };
      // lastMessage / remoteExtra 转换暂略(P2-A4 补 Convert)
      conversations.push(conv);
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
    // P2-A4 补完整 Convert.toMessage;P2-A3 第一版返回空数组让 messageList 不报错
    // (Adapter listener 推送的实时消息仍能正常 append)
    void resp;
    return [];
  };

  provider.messageReadedCallback = async () => {
    // no-op P2 阶段
  };
}
