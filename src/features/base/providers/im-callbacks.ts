import WKSDK, {
  Channel,
  ChannelInfo,
  ChannelTypeGroup,
  ChannelTypePerson,
  Subscriber,
  type Conversation,
  type Message,
} from "wukongimjssdk";
import { channelSpaceKey, channelSpaceMap, spaceStore } from "@/features/base/stores/space";
import {
  markMessagesReaded,
  syncConversations,
  syncChannelMessages,
} from "@/features/base/api/endpoints/conversation.api";
import { getChannelInfoRaw } from "@/features/base/api/endpoints/channel.api";
import { syncGroupMembers, type GroupMemberRaw } from "@/features/base/api/endpoints/group.api";
import {
  groupToChannelInfo,
  rawToConversation,
  rawToMessage,
  userToChannelInfo,
} from "@/features/base/im/convert";
import { MediaMessageUploadTask } from "@/features/base/im/upload-task";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** ChannelType 7 = ChannelTypeCommunityTopic(子区);SDK 1.3.5 未导出常量。 */
const CHANNEL_TYPE_THREAD = 7;

/** GroupRole:对齐旧 @octo/base 常量(normal=0, owner=1, manager=2)。 */
const ROLE_OWNER = 1;

/**
 * 从 SDK 所有群成员缓存里查 uid 是否曾被标记为 robot。
 * 用途:channelInfoCallback 拉到 person channelInfo 时,raw.robot 可能为空,
 * 我们从群成员缓存兜底 — 如果该 uid 在任一群里 orgData.robot===1,认定为 AI。
 */
function lookupRobotFromSubscriberCache(uid: string): boolean {
  const cache = WKSDK.shared().channelManager.subscribeCacheMap;
  for (const list of cache.values()) {
    if (
      list.some((s) => s.uid === uid && (s.orgData as { robot?: number } | undefined)?.robot === 1)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 把 GroupMemberRaw 转 SDK Subscriber。version / role / orgData 全量透传,
 * 后续 ChannelSetting / GroupManagement 直接消费。
 */
function rawToSubscriber(m: GroupMemberRaw): Subscriber {
  const sub = new Subscriber();
  sub.uid = m.uid;
  sub.name = m.name ?? "";
  sub.remark = m.remark ?? "";
  sub.role = m.role ?? 0;
  sub.version = m.version ?? 0;
  sub.isDeleted = (m.is_deleted ?? 0) === 1;
  sub.status = m.status ?? 0;
  sub.orgData = { ...m, bot_admin: m.bot_admin ?? 0 };
  return sub;
}

/** 旧版排序口径:owner 升到 999,其余按 role desc(manager>normal)。 */
function sortByRole(members: Subscriber[]): Subscriber[] {
  return [...members].sort((a, b) => {
    const roleA = a.role === ROLE_OWNER ? 999 : a.role;
    const roleB = b.role === ROLE_OWNER ? 999 : b.role;
    return roleB - roleA;
  });
}

/**
 * 注册 SDK provider 必须的 callback(否则 conversationManager.sync /
 * chatManager.syncMessages 等会抛 TypeError)。
 *
 * 对应旧项目 `packages/dmworkdatasource/src/module.ts` 的 set*Callback 系列。
 * 覆盖让"会话列表 + 消息历史 + 上传 + 已读 + 群成员" 跑起来的集合:
 *   - syncConversationsCallback     → POST conversation/sync,转 raw → Conversation
 *                                     用 users[]/groups[] 预热 channelInfo 缓存(立刻显示真名),
 *                                     Space 防 stale 响应,channelSpaceMap 反查表
 *   - channelInfoCallback           → GET channels/{id}/{type},转 raw → ChannelInfo
 *                                     person 缺失 robot 时从群成员缓存兜底;
 *                                     group 字段(forbidden/has_group_md/...)透传;
 *                                     category=system/visitor 加 identity icon
 *   - syncSubscribersCallback       → GET groups/{groupNo}/membersync,
 *                                     按 role 排序,robot=1 反向同步到 person cache
 *                                     (子区走父群 ID)
 *   - syncMessagesCallback          → POST message/channel/sync,转 raw → Message
 *   - messageReadedCallback         → POST message/readed(批量已读上报)
 *   - messageUploadTaskCallback     → MediaMessageUploadTask(COS 直传)
 *
 * 幂等:多次调安全(SDK 内部直接覆盖 callback)。在 IMProvider mount 时调一次。
 */
export function registerImCallbacks(): void {
  const provider = WKSDK.shared().config.provider;

  provider.syncConversationsCallback = async () => {
    const spaceId = spaceStore.state.spaceId || undefined;
    const resp = await syncConversations(spaceId);
    // Space 防 stale:发请求后用户切换了 Space,旧响应不入缓存(旧 module.ts:296 同语义)
    if (spaceId && spaceStore.state.spaceId !== spaceId) {
      return [];
    }
    const conversations: Conversation[] = (resp.conversations ?? []).map(rawToConversation);
    // channelSpaceMap 反查表 — conversation 带 space_id 时写一份(跨 Space 跳转用)
    for (const c of resp.conversations ?? []) {
      if (c.space_id) {
        channelSpaceMap.set(channelSpaceKey(c.channel_id, c.channel_type), c.space_id);
      }
    }
    // users / groups 预热到 channelInfo 缓存 — 列表立刻能显示真名,不用每行单独拉
    const cm = WKSDK.shared().channelManager;
    for (const u of resp.users ?? []) {
      cm.setChannleInfoForCache(userToChannelInfo(u));
    }
    for (const g of resp.groups ?? []) {
      cm.setChannleInfoForCache(groupToChannelInfo(g));
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
      // logo fallback:旧版逻辑 — person 走 users/{uid}/avatar,group 走 groups/{id}/avatar
      if (!info.logo) {
        if (channel.channelType === ChannelTypePerson) {
          info.logo = `users/${channel.channelID}/avatar`;
        } else if (channel.channelType === ChannelTypeGroup) {
          info.logo = `groups/${channel.channelID}/avatar`;
        }
      }

      const extra = raw.extra ?? {};
      const orgData: Record<string, unknown> = {
        ...extra,
        remark: raw.remark ?? "",
        displayName: raw.remark && raw.remark !== "" ? raw.remark : (raw.name ?? ""),
        notice: raw.notice,
        receipt: raw.receipt,
        status: raw.status,
        follow: raw.follow,
        category: raw.category,
        be_deleted: raw.be_deleted,
        be_blacklist: raw.be_blacklist,
      };

      // robot 字段:raw 显式给则用,否则从群成员缓存兜底(只对 person)
      if (raw.robot != null) {
        orgData.robot = raw.robot;
      } else if (channel.channelType === ChannelTypePerson) {
        if (lookupRobotFromSubscriberCache(channel.channelID)) {
          orgData.robot = 1;
        }
      }

      // person 专属字段
      if (channel.channelType === ChannelTypePerson) {
        orgData.shortNo = (extra as { short_no?: string }).short_no ?? "";
      } else if (channel.channelType === ChannelTypeGroup) {
        const extraGroup = extra as Record<string, unknown>;
        orgData.forbidden = raw.forbidden;
        orgData.invite = raw.invite;
        orgData.forbiddenAddFriend = extraGroup.forbidden_add_friend;
        orgData.save = raw.save;
        orgData.has_group_md = !!(raw.has_group_md ?? extraGroup.has_group_md);
        orgData.group_md_version =
          raw.group_md_version ?? (extraGroup.group_md_version as number | undefined) ?? 0;
        orgData.group_md_updated_at =
          raw.group_md_updated_at ?? (extraGroup.group_md_updated_at as string | undefined) ?? null;
        orgData.can_edit_group_md = !!(raw.can_edit_group_md ?? extraGroup.can_edit_group_md);
        orgData.can_manage_bot_admin = !!(
          raw.can_manage_bot_admin ?? extraGroup.can_manage_bot_admin
        );
      }

      // category=system/customerService/visitor 加 identity icon(对齐旧版静态 path)
      const cat = orgData.category;
      if (cat === "system" || cat === "customerService") {
        orgData.identityIcon = "./identity_icon/official.png";
        orgData.identitySize = { width: "18px", height: "18px" };
      } else if (cat === "visitor") {
        orgData.identityIcon = "./identity_icon/visitor.png";
        orgData.identitySize = { width: "48px", height: "24px" };
      }

      info.orgData = orgData;
    } catch {
      // 404 / 无权限:返回空 title 占位,避免渲染 channelID hex
      info.title = "";
      info.orgData = {};
    }
    return info;
  };

  provider.syncSubscribersCallback = async (
    channel: Channel,
    version: number,
  ): Promise<Subscriber[]> => {
    // 子区(ChannelTypeCommunityTopic)的成员就是父群成员,走父群 ID
    let groupNo = channel.channelID;
    if (channel.channelType === CHANNEL_TYPE_THREAD) {
      const parsed = parseThreadChannelId(channel.channelID);
      if (parsed) groupNo = parsed.groupNo;
    }
    let raw: GroupMemberRaw[];
    try {
      raw = await syncGroupMembers(groupNo, version);
    } catch {
      return [];
    }
    const members = raw.map(rawToSubscriber);
    const sorted = sortByRole(members);

    // robot 字段反向同步到 person channelInfo 缓存:消息列表 / 联系人页能立刻显示 AI 标识,
    // 不用每个 uid 各自 fetchChannelInfo(对齐旧 module.ts:203-213)
    const cm = WKSDK.shared().channelManager;
    for (const member of sorted) {
      if ((member.orgData as { robot?: number } | undefined)?.robot !== 1) continue;
      const personChannel = new Channel(member.uid, ChannelTypePerson);
      const existing = cm.getChannelInfo(personChannel);
      if (existing) {
        const og = (existing.orgData ?? {}) as Record<string, unknown>;
        og.robot = 1;
        existing.orgData = og;
        cm.setChannleInfoForCache(existing);
      }
    }

    return sorted;
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

  provider.messageReadedCallback = async (channel, messages) => {
    const messageIds = messages.map((m) => m.messageID).filter(Boolean);
    if (messageIds.length === 0) return;
    try {
      await markMessagesReaded({
        channelId: channel.channelID,
        channelType: channel.channelType,
        messageIds,
      });
    } catch {
      // 已读上报失败不阻塞用户操作(对应旧项目 module.ts:282 .catch swallow)
    }
  };

  provider.messageUploadTaskCallback = (msg: Message) => new MediaMessageUploadTask(msg);
}
