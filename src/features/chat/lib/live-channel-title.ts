import WKSDK, { type Channel } from "wukongimjssdk";

/**
 * 实时取 channel 的真实 title + 请求风暴防护。
 *
 * **为什么不靠 conv.channelInfo**:stub conv(follow-list 从 sidebar 合成的占位)
 * 字段永远 undefined,即便 SDK channelInfoCallback 已写入 cache,stub 不会更新。
 * 直接走 SDK channelManager.getChannelInfo 拿实时 ChannelInfo。
 *
 * **请求风暴防护**(关键):
 * 关注 tab 父群下嵌套 N 条子区,channelInfoListener 触发 useConversationsSync 重渲 →
 * row render 再调本函数 → SDK cache 失败的 channel 又 fetch → 又写 listener →
 * 重渲...实测 12s 内累计 1700+ 请求(`groups/{}/threads/{}`)。
 *
 * 用模块级 attempted Set 永久记录已发起的 fetch:**每个 channel 整个会话期内最多
 * fetch 一次**(成功 → SDK cache 命中,无需再 fetch;失败 → 不无限重试)。
 * Space 切换由 wireFetchedTitleCacheReset 监听 spaceStore 自动清除。
 *
 * 用法:row render 时调 getLiveTitle(channel) 拿 { title, loading };
 * 头像走 ChannelAvatar 自身的 SDK 调用,跟 title 独立。
 */
const attemptedTitleFetch = new Set<string>();

function key(channel: Channel): string {
  return `${channel.channelType}_${channel.channelID}`;
}

export function getLiveTitle(channel: Channel): { title: string; loading: boolean } {
  const info = WKSDK.shared().channelManager.getChannelInfo(channel);
  if (!info) {
    tryFetchChannelInfo(channel);
    return { title: "", loading: true };
  }
  const display = (info.orgData as { displayName?: string } | undefined)?.displayName;
  const t = display || info.title || "";
  // 已有 cache 但 title 为空(如 channelInfoCallback 返回空 title):
  // 不再 loading — 用 channelID 兜底显示,避免永久 skeleton(Issue #116)
  return { title: t || channel.channelID, loading: false };
}

/**
 * 共用的"render 时 SDK channelInfo 安全 fetch" — 适配任何在 render 函数里要
 * 拉 channelInfo 的场景(conversation-list 父群/子区头像借用,follow-list row title 等)。
 * 同一 channel 整个会话期最多 fetch 一次,Space 切走由 clearFetchedTitleCache 重置。
 */
export function tryFetchChannelInfo(channel: Channel): void {
  const k = key(channel);
  if (attemptedTitleFetch.has(k)) return;
  attemptedTitleFetch.add(k);
  void WKSDK.shared().channelManager.fetchChannelInfo(channel);
}

export function clearFetchedTitleCache(): void {
  attemptedTitleFetch.clear();
}
