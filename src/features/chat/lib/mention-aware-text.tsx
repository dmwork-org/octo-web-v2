import type { ReactNode } from "react";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, type Mention } from "wukongimjssdk";
import { openChatProfile } from "@/features/chat/lib/open-profile";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";

/** SDK Mention 缺 humans/ais 三态字段类型,本地补;运行时由 send-content-proxy 注入。 */
type MentionWithFlags = Mention & { humans?: number; ais?: number };

/**
 * 收集 uid 在群/Person channelInfo 内**所有可能的显示名候选**(跟 text-renderer
 * collectCandidateNames 同款,本地副本未抽公共)。
 */
function collectCandidateNames(uid: string, channel: Channel): string[] {
  const names: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 0 && !names.includes(v)) names.push(v);
  };
  if (channel.channelType === ChannelTypeGroup) {
    const sub = WKSDK.shared()
      .channelManager.getSubscribes(channel)
      ?.find((s) => s.uid === uid);
    push(sub?.remark);
    push(sub?.name);
    const subOrg = sub?.orgData as { real_name?: string; displayName?: string } | undefined;
    push(subOrg?.real_name);
    push(subOrg?.displayName);
  }
  const info = WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
  push(info?.title);
  const infoOrg = info?.orgData as
    | { remark?: string; real_name?: string; displayName?: string }
    | undefined;
  push(infoOrg?.remark);
  push(infoOrg?.real_name);
  push(infoOrg?.displayName);
  return names;
}

/**
 * @ 提及高亮 tag(对应旧 dmworkbase Messages/Text MarkdownContent mention):
 * brand 色文本 + 浅 brand 底胶囊,@all 用纯 brand 色无背景。
 * uid 非空时 click 弹 UserInfoModal / BotDetailModal(经 openChatProfile 判 bot)。
 */
export function MentionTag({
  children,
  isAll,
  uid,
}: {
  children: string;
  isAll?: boolean;
  uid?: string;
}) {
  const clickable = !isAll && !!uid;
  const base = "inline-flex items-center rounded-[4px] px-2 py-[2px] font-medium text-[#6B3DD8]";
  if (!clickable) {
    return (
      <span className={isAll ? "font-medium text-[#6B3DD8]" : `${base} bg-[rgba(107,61,216,0.08)]`}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openChatProfile(uid);
      }}
      className={`${base} cursor-pointer bg-[rgba(107,61,216,0.08)] hover:bg-[rgba(107,61,216,0.12)]`}
    >
      {children}
    </button>
  );
}

/**
 * Plain text 渲染,把 @ 匹配段替换为 MentionTag(对齐 text-renderer mentionTokens)。
 *
 * **使用场景**:RichText=14 text block 需要在不走 markdown 解析的前提下高亮 @,
 * 跟 text-renderer 的 mention 行为保持一致。
 *
 * **匹配策略**(issue #46):
 *   1. 主路径 — candidate names 精确匹配:每个 uid 用 collectCandidateNames 取
 *      真实显示名,`@<name>` 在 text 里 indexOf 匹配。支持带空格 / 特殊字符
 *      的名字(如 `@新Octo Bug 收集`),且不会误绑 text 里字面 @ 串
 *   2. 兜底 — 正则按序绑剩余未匹配 uid(缓存 race 或用户写法跟 candidate 不一致)
 *
 * **全员/AI**:
 *   - mention.all   → @所有人 / @all 高亮
 *   - mention.humans→ @所有人 高亮(broadcast)
 *   - mention.ais   → @所有AI 高亮(broadcast,uids 视为 routing 不绑文本)
 */
export function MentionAwareText({
  text,
  mention,
  channel,
}: {
  text: string;
  mention?: Mention;
  channel?: Channel;
}) {
  // 订阅全局 channelInfo 变化 — cache race 时主路径会触发 fetch,到位后重渲。
  // 必须在所有早返回之前调,遵守 React Rules of Hooks。
  useChannelInfoTick();
  if (!text) return <>{text}</>;
  if (!mention) return <>{text}</>;
  const flags = mention as MentionWithFlags;
  if (!mention.uids?.length && !mention.all && !flags.humans && !flags.ais) {
    return <>{text}</>;
  }

  type Hit = { start: number; end: number; node: ReactNode };
  const hits: Hit[] = [];

  const pushAllOccurrences = (needle: string, render: (key: string) => ReactNode) => {
    if (!needle) return;
    let from = 0;
    let n = 0;
    while (true) {
      const idx = text.indexOf(needle, from);
      if (idx === -1) break;
      hits.push({ start: idx, end: idx + needle.length, node: render(`tk-${needle}-${n++}`) });
      from = idx + needle.length;
    }
  };

  if (mention.all) {
    pushAllOccurrences("@所有人", (k) => (
      <MentionTag key={k} isAll>
        @所有人
      </MentionTag>
    ));
    pushAllOccurrences("@all", (k) => (
      <MentionTag key={k} isAll>
        @all
      </MentionTag>
    ));
  }
  if (flags.humans) {
    pushAllOccurrences("@所有人", (k) => (
      <MentionTag key={k} isAll>
        @所有人
      </MentionTag>
    ));
  }
  if (flags.ais) {
    pushAllOccurrences("@所有AI", (k) => (
      <MentionTag key={k} isAll>
        @所有AI
      </MentionTag>
    ));
    // ais=1 时 uids 是 routing bot,不绑文本(fail-closed,对齐 text-renderer)
  } else {
    const uids = mention.uids ?? [];
    // 主路径 — candidate names 精确匹配(需要 channel)。
    // 不走正则兜底:正则按文本顺序绑会把"@我点不掉"等文字字面 @ 串误绑给
    // uids[0](issue #46 真凶)。cache race 时主动 fetchChannelInfo 触发拉取,
    // useChannelInfoTick 监听 channelInfo 变化后 re-render,本函数重算 hits。
    if (channel) {
      for (const uid of uids) {
        const names = collectCandidateNames(uid, channel);
        if (names.length === 0) {
          void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
          continue;
        }
        let found = false;
        for (const name of names) {
          const needle = `@${name}`;
          let from = 0;
          while (from < text.length) {
            const idx = text.indexOf(needle, from);
            if (idx === -1) break;
            const overlap = hits.some((h) => idx < h.end && idx + needle.length > h.start);
            if (!overlap) {
              hits.push({
                start: idx,
                end: idx + needle.length,
                node: (
                  <MentionTag key={`tk-uid-${uid}-${idx}`} uid={uid}>
                    {needle}
                  </MentionTag>
                ),
              });
              found = true;
              break;
            }
            from = idx + 1;
          }
          if (found) break;
        }
      }
    }
  }

  if (hits.length === 0) return <>{text}</>;
  // 按 start 排序,去重叠(broadcast 通常在前,先注册先生效)
  hits.sort((a, b) => a.start - b.start);
  const dedup: Hit[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start < cursor) continue;
    dedup.push(h);
    cursor = h.end;
  }

  const out: ReactNode[] = [];
  let pos = 0;
  for (const h of dedup) {
    if (h.start > pos) out.push(text.slice(pos, h.start));
    out.push(h.node);
    pos = h.end;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return <>{out}</>;
}
