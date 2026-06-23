import WKSDK, {
  Channel,
  ChannelInfo,
  ChannelTypeGroup,
  ChannelTypePerson,
  Subscriber,
  type Conversation,
  type ConversationExtra,
  type Message,
  type MessageExtra,
  type Reminder,
} from "wukongimjssdk";
import { channelSpaceKey, channelSpaceMap, spaceStore } from "@/features/base/stores/space";
import {
  markMessagesReaded,
  syncChannelMessages,
  syncConversationExtras,
  syncConversations,
  syncMessageExtras,
} from "@/features/base/api/endpoints/conversation.api";
import { getChannelInfoRaw } from "@/features/base/api/endpoints/channel.api";
import {
  getThread,
  syncGroupMembers,
  type GroupMemberRaw,
  type ThreadRaw,
} from "@/features/base/api/endpoints/group.api";
import { markRemindersDone, syncReminders } from "@/features/base/api/endpoints/reminder.api";
import {
  groupToChannelInfo,
  rawToConversation,
  rawToConversationExtra,
  rawToMessage,
  rawToMessageExtra,
  rawToReminder,
  userToChannelInfo,
} from "@/features/base/im/convert";
import { MediaMessageUploadTask } from "@/features/base/im/upload-task";
import { parseThreadChannelId } from "@/features/base/im/parse-thread-channel-id";

/** ChannelType 7 = ChannelTypeCommunityTopic(子区);SDK 1.3.5 未导出常量。 */
const CHANNEL_TYPE_THREAD = 5; // ChannelTypeCommunityTopic(对齐旧 dmworkbase Const.ts);SDK 1.3.5 7 = ChannelTypeData,不是子区

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

export function sortSubscribersForSyncCursor(members: Subscriber[]): Subscriber[] {
  // SDK uses the last cached subscriber.version as the next membersync cursor.
  return [...members].sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
}

export function getSubscriberSyncVersion(channel: Channel, sdkVersion: number): number {
  const cached = WKSDK.shared().channelManager.subscribeCacheMap.get(channel.getChannelKey());
  const cachedMaxVersion =
    cached?.reduce((maxVersion, subscriber) => {
      return Math.max(maxVersion, subscriber.version ?? 0);
    }, 0) ?? 0;
  return Math.max(sdkVersion, cachedMaxVersion);
}

/**
 * 收集当前会话列表里所有 group / thread 的 channel_id。
 *
 * reminder 同步接口要求传 channel_ids 限制范围(只关心我所在的群/子区),
 * 后端不会扫所有 reminder 表,带宽友好。
 */
function collectGroupChannelIds(): string[] {
  const ids: string[] = [];
  const conversations = WKSDK.shared().conversationManager.conversations;
  if (!conversations) return ids;
  for (const c of conversations) {
    if (
      c.channel.channelType === ChannelTypeGroup ||
      c.channel.channelType === CHANNEL_TYPE_THREAD
    ) {
      ids.push(c.channel.channelID);
    }
  }
  return ids;
}

/**
 * 子区 channelInfo 分支(K-5):channelType === CHANNEL_TYPE_THREAD 时不走
 * channels/{id}/{type},而是 parseThreadChannelId + GET groups/{groupNo}/threads/{shortId}。
 *
 * - title = thread.name
 * - logo = 父群头像 `groups/{groupNo}/avatar`
 * - mute = thread.mute === 1(tri-state:null = 继承父群,0 = 显式不静音,1 = 显式静音;
 *   只把 ===1 当 true,其它都 false,SDK listener 触发重渲使用此值。
 *   有效 mute 状态(effectiveMute)由消费方从 orgData.thread.mute 自取原始 tri-state)
 * - orgData 透传 thread 全量 + parentGroupNo + has_thread_md / thread_md_version 等
 *
 * 解析失败 / 接口失败 → 返回 title=channelID 占位的兜底 ChannelInfo,不抛。
 */
async function buildThreadChannelInfo(channel: Channel): Promise<ChannelInfo> {
  const info = new ChannelInfo();
  info.channel = channel;
  const parsed = parseThreadChannelId(channel.channelID);
  if (!parsed) {
    info.title = channel.channelID;
    info.orgData = {};
    return info;
  }
  let thread: ThreadRaw;
  try {
    // silent: true — 已归档/已删除子区可能返回 404,不弹全局错误 toast(对齐旧项目 catch swallow)
    thread = await getThread(parsed.groupNo, parsed.shortId, { silent: true });
  } catch {
    // API 失败(404 / 已归档 / 无权限):用 channelID 兜底,确保 titleLoading 能 resolve
    info.title = channel.channelID;
    info.orgData = {};
    return info;
  }
  // thread.name 可能为空(已归档子区后端清空 name 等),用 channelID 兜底避免 titleLoading 永真
  const displayName = thread.name || channel.channelID;
  info.title = displayName;
  info.logo = `groups/${parsed.groupNo}/avatar`;
  info.mute = thread.mute === 1;
  info.orgData = {
    displayName,
    thread,
    parentGroupNo: parsed.groupNo,
    has_thread_md: !!thread.has_thread_md,
    thread_md_version: thread.thread_md_version ?? 0,
    thread_md_updated_at: thread.thread_md_updated_at ?? null,
  };
  return info;
}

/**
 * 注册 SDK provider 必须的 callback(否则 conversationManager.sync /
 * chatManager.syncMessages 等会抛 TypeError)。
 *
 * 对应旧项目 `packages/dmworkdatasource/src/module.ts` 的 set*Callback 系列。
 * 覆盖让"会话列表 + 消息历史 + 上传 + 已读 + 群成员 + extras + 提醒" 跑起来的集合:
 *   - syncConversationsCallback        users[]/groups[] 预热,Space 防 stale,channelSpaceMap
 *   - syncConversationExtrasCallback   keep_msg_seq / draft 跨设备同步
 *   - channelInfoCallback              robot 兜底 / group 字段 / identity icon /
 *                                     子区分支(GET groups/{}/threads/{}, 父群头像继承)
 *   - syncSubscribersCallback          group/membersync(子区走父群)+ robot 反向写 person cache
 *   - syncMessagesCallback             message/channel/sync
 *   - syncMessageExtraCallback         message/extra/sync(已读数 / 撤回增量)
 *   - syncRemindersCallback            message/reminder/sync(@我 / 入群申请),
 *                                     channel_ids 只传当前会话列表里 group/thread
 *   - reminderDoneCallback             message/reminder/done(用户点掉 @提醒后)
 *   - messageReadedCallback            message/readed 批量上报
 *   - messageUploadTaskCallback        MediaMessageUploadTask COS 直传
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
    // 子区(thread)等不在 users/groups payload 里的 channel 兜底:lazy fetch。
    // SDK fetchChannelInfo 内部去重(Map<key, Promise>),不会重复打接口;
    // 命中缓存的 channel 直接 return,代价接近 0。
    for (const conv of conversations) {
      void cm.fetchChannelInfo(conv.channel);
    }
    return conversations;
  };

  provider.syncConversationExtrasCallback = async (
    version: number,
  ): Promise<ConversationExtra[]> => {
    let raws;
    try {
      raws = await syncConversationExtras(version);
    } catch {
      return [];
    }
    return raws.map(rawToConversationExtra);
  };

  provider.channelInfoCallback = async (channel: Channel): Promise<ChannelInfo> => {
    // 子区分支:走 groups/{}/threads/{} 拿父群头像 + thread 元数据
    if (channel.channelType === CHANNEL_TYPE_THREAD) {
      return buildThreadChannelInfo(channel);
    }
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
        // Space 归属:isChannelOfSpace 第 2 层 fallback 必读字段,优先 raw 顶层,
        // 兼容 extra 嵌套(不同后端版本字段位置不一致)
        space_id: raw.space_id ?? (extra as { space_id?: string }).space_id,
        // 透传后端可能在顶层 / extra 里的 member_count 字段(channel setting "成员" 行用)
        member_count:
          (raw as { member_count?: number }).member_count ??
          (extra as { member_count?: number }).member_count,
      };

      // channelSpaceMap 回填:channelInfoCallback 是 fetchChannelInfo 的实际回调,
      // 拿到 space_id 立即回填反查表,避免后续 listener 重复 fetch
      const orgSpace = orgData.space_id as string | undefined;
      if (orgSpace && channel.channelType === ChannelTypeGroup) {
        channelSpaceMap.set(channelSpaceKey(channel.channelID, channel.channelType), orgSpace);
      }

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
        // bot 命令清单(JSON 字符串,composer 端解析后驱动 / 斜杠菜单;非 bot 不会有)
        orgData.bot_commands =
          raw.bot_commands ?? (extra as { bot_commands?: string }).bot_commands;
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
        // 群级「允许 Bot 免@回答」总开关(对齐上游 ceffa569):老数据无字段时回退 1(允许),零回归
        orgData.allow_no_mention =
          raw.allow_no_mention ?? (extraGroup.allow_no_mention as number | undefined) ?? 1;
      }

      // category=system/customerService/visitor 加 identity icon(对齐旧版静态 path)
      const cat = orgData.category;
      if (cat === "system" || cat === "customerService") {
        orgData.identityIcon = "/identity_icon/official.png";
        orgData.identitySize = { width: "18px", height: "18px" };
      } else if (cat === "visitor") {
        orgData.identityIcon = "/identity_icon/visitor.png";
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
      raw = await syncGroupMembers(groupNo, getSubscriberSyncVersion(channel, version));
    } catch {
      return [];
    }
    const members = sortSubscribersForSyncCursor(raw.map(rawToSubscriber));

    // robot / space_id 反向同步到 person channelInfo 缓存:消息列表 / 联系人页 / @提及列表
    // 能立刻显示 AI 标识和外部标记,不用每个 uid 各自 fetchChannelInfo(对齐旧 module.ts:203-213)
    const cm = WKSDK.shared().channelManager;
    for (const member of members) {
      const og = member.orgData as { robot?: number; space_id?: string } | undefined;
      const isRobot = og?.robot === 1;
      const memberSpaceId = og?.space_id;
      if (!isRobot && !memberSpaceId) continue;
      const personChannel = new Channel(member.uid, ChannelTypePerson);
      const existing = cm.getChannelInfo(personChannel);
      if (existing) {
        const existingOg = (existing.orgData ?? {}) as Record<string, unknown>;
        let changed = false;
        if (isRobot && existingOg.robot !== 1) {
          existingOg.robot = 1;
          changed = true;
        }
        if (memberSpaceId && !existingOg.space_id) {
          existingOg.space_id = memberSpaceId;
          changed = true;
        }
        if (changed) {
          existing.orgData = existingOg;
          cm.setChannleInfoForCache(existing);
        }
      }
    }

    return members;
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

  provider.syncMessageExtraCallback = async (
    channel: Channel,
    extraVersion: number,
    limit: number,
  ): Promise<MessageExtra[]> => {
    let raws;
    try {
      raws = await syncMessageExtras({
        channel_id: channel.channelID,
        channel_type: channel.channelType,
        extra_version: extraVersion,
        limit,
      });
    } catch {
      return [];
    }
    return raws.map(rawToMessageExtra);
  };

  provider.syncRemindersCallback = async (version: number): Promise<Reminder[]> => {
    const channelIds = collectGroupChannelIds();
    let raws;
    try {
      raws = await syncReminders({ version, limit: 100, channel_ids: channelIds });
    } catch {
      return [];
    }
    return raws.map(rawToReminder);
  };

  provider.reminderDoneCallback = async (ids: number[]) => {
    try {
      await markRemindersDone(ids);
    } catch {
      // 同 messageReaded:done 上报失败不阻塞用户(下次 sync 仍会拉到,SDK 自己去重)
    }
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
