import { ChannelTypeGroup } from "wukongimjssdk";
import { getMyGroups, listThreads, type ThreadRaw } from "@/features/base/api/endpoints/group.api";

/**
 * 关联会话弹窗的候选项类型。
 *
 * 群和子区共用一个类型，通过 channelType 区分：
 * - channelType === ChannelTypeGroup (2): 群
 * - channelType === CHANNEL_TYPE_COMMUNITY_TOPIC (5): 子区
 */
export interface ChannelOption {
  channelId: string;
  channelType: number;
  name: string;
  desc?: string;
  memberCount?: number;
  /** 子区才有：父群名，用于显示"在 #父群名"上下文 */
  parentGroupName?: string;
  /** 子区才有：父群 group_no，用于渲染头像（子区复用父群头像） */
  parentGroupNo?: string;
}

/**
 * loadChannels 的返回类型。
 *
 * channels 是候选列表；threadLoadErrors 只在部分群的子区拉取失败时非空。
 */
export interface LoadChannelsResult {
  channels: ChannelOption[];
  /** 子区加载失败的父群名（用于警告条显示） */
  threadLoadErrors?: string[];
}

/** 子区类型常量（对应 wukongimjssdk 的 ChannelTypeCommunityTopic） */
const CHANNEL_TYPE_COMMUNITY_TOPIC = 5;

/**
 * 把"我加入的群" + "每群我加入的活跃子区"摊平成 ChannelOption 列表。
 *
 * 行为：
 * - 群直接列，用 getMyGroups()
 * - 每个群再 fan-out 拉子区，concurrency 路并发，不阻断（单群失败不影响其它群）
 * - 子区只列 status=Active 且 is_member !== 0
 * - 子区按父群的顺序紧跟在群条目后面摊平，带上 parentGroupName / parentGroupNo
 * - 单群子区拉取失败时：收集失败群名，记日志
 */
export async function buildLinkableChannels(
  spaceId: string,
  options?: {
    /** 并发拉子区的 worker 数。默认 4 */
    concurrency?: number;
    /** 单群子区拉取失败的日志钩子 */
    onThreadListError?: (groupNo: string, err: unknown) => void;
    /** 子区没有名称时的兜底名称 */
    unnamedThreadName?: string;
  },
): Promise<LoadChannelsResult> {
  const concurrency = options?.concurrency ?? 4;
  const unnamedThreadName = options?.unnamedThreadName ?? "未命名子区";
  const onErr =
    options?.onThreadListError ??
    ((groupNo, err) => {
      console.warn("[buildLinkableChannels] listThreads failed for group", groupNo, err);
    });

  // 1. 拉取所有群
  const groups = await getMyGroups(spaceId);

  const groupOptions: ChannelOption[] = groups.map((g) => ({
    channelId: g.group_no,
    channelType: ChannelTypeGroup,
    name: g.name,
    desc: g.remark,
    memberCount: g.member_count,
  }));

  // 2. 只对群类型拉子区（对齐原始项目：跳过单聊等非群 channel）
  const groupNos = groupOptions
    .filter((g) => g.channelType === ChannelTypeGroup)
    .map((g) => g.channelId);
  const groupNameByNo = new Map(
    groupOptions
      .filter((g) => g.channelType === ChannelTypeGroup)
      .map((g) => [g.channelId, g.name]),
  );

  const threadsByGroup = new Map<string, ThreadRaw[]>();
  const failedGroupNames: string[] = [];

  // 简单的 worker pool
  let cursor = 0;
  async function worker() {
    while (cursor < groupNos.length) {
      const idx = cursor++;
      const no = groupNos[idx];
      try {
        const list = await listThreads(no, { page_index: 1, page_size: 100 });
        threadsByGroup.set(no, list || []);
      } catch (err) {
        onErr(no, err);
        threadsByGroup.set(no, []);
        failedGroupNames.push(groupNameByNo.get(no) || no);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, groupNos.length) }, worker),
  );

  // 3. 摊平：群在前，该群的活跃子区紧跟在后
  const result: ChannelOption[] = [];
  for (const g of groupOptions) {
    result.push(g);
    const threads = threadsByGroup.get(g.channelId) || [];
    for (const t of threads) {
      // 只列 status=Active(1)；is_member 明确为 false(0) 才排除
      if (t.status !== 1 && t.status !== undefined) continue;
      if (t.is_member === 0) continue;
      // 子区 channelId 必须有效
      if (!t.short_id) continue;
      result.push({
        channelId: t.channel_id || `${g.channelId}____${t.short_id}`,
        channelType: CHANNEL_TYPE_COMMUNITY_TOPIC,
        name: t.name || unnamedThreadName,
        memberCount: t.member_count,
        parentGroupName: g.name,
        parentGroupNo: g.channelId,
      });
    }
  }

  return {
    channels: result,
    threadLoadErrors: failedGroupNames.length ? failedGroupNames : undefined,
  };
}
