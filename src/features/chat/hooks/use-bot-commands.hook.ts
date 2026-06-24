import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelInfo, ChannelTypePerson } from "wukongimjssdk";
import type { ChannelInfoListener } from "wukongimjssdk";
import type { BotCommand } from "@/features/chat/components/slash-command-menu";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";

/** 浅相等:length + 同 index command+description 字符串一致(rebuild parse 同源 JSON 时大概率命中)。 */
function sameCommands(a: BotCommand[], b: BotCommand[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].command !== b[i].command || a[i].description !== b[i].description) return false;
  }
  return true;
}

/**
 * 解析 channelInfo.orgData.bot_commands(JSON 字符串)为 BotCommand[]。
 *
 * - 仅 person + robot=1 的 bot 私聊有这个字段
 * - 后端给的是 JSON 字符串(对齐旧 dmworkbase Conversation/index.tsx:1797-1810)
 * - 字段缺失 / JSON 解析失败 / 类型不符 → 返回空数组(fail-safe)
 *
 * 监听 channelInfoListener,channelInfo 异步更新后重新解析。
 */
export function useBotCommands(channel: Channel): BotCommand[] {
  const [commands, setCommands] = useState<BotCommand[]>([]);

  useEffect(() => {
    if (channel.channelType !== ChannelTypePerson) {
      setCommands((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const parse = () => {
      const info = WKSDK.shared().channelManager.getChannelInfo(channel);
      const og = info?.orgData as { robot?: number; bot_commands?: string } | undefined;
      if (!og || og.robot !== 1 || !og.bot_commands) {
        setCommands((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(og.bot_commands);
        if (!Array.isArray(parsed)) {
          setCommands((prev) => (prev.length === 0 ? prev : []));
          return;
        }
        const valid = parsed.filter((c): c is BotCommand => {
          if (typeof c !== "object" || c === null) return false;
          const r = c as { command?: unknown; description?: unknown };
          return typeof r.command === "string" && typeof r.description === "string";
        });
        setCommands((prev) => (sameCommands(prev, valid) ? prev : valid));
      } catch {
        setCommands((prev) => (prev.length === 0 ? prev : []));
      }
    };

    parse();
    // 兜底:channelInfo 还没拉到 → 主动 fetch,listener 触发再 parse
    tryFetchChannelInfo(channel);

    const listener: ChannelInfoListener = (info: ChannelInfo) => {
      if (
        info.channel.channelID === channel.channelID &&
        info.channel.channelType === channel.channelType
      ) {
        parse();
      }
    };
    WKSDK.shared().channelManager.addListener(listener);
    return () => WKSDK.shared().channelManager.removeListener(listener);
  }, [channel]);

  return commands;
}
