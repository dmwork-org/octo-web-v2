import { api } from "@/features/base/api/client";
import type { AppBotInfo } from "@/features/appbot/types/app-bot.types";

/**
 * App Bot endpoints(走 wkhttp `/v1`,共享 base/api/client 的 token + space header)。
 *
 * - GET /v1/app_bot/available?space_id  → 当前账号可见的 bot(平台 + 空间私有合并)
 * - POST /v1/app_bot/apply  body { robot_uid }  → 申请与 bot 的好友关系(幂等;
 *   已是好友返回 OK)
 */

export async function getAvailableBots(spaceId?: string): Promise<AppBotInfo[]> {
  const resp = await api<AppBotInfo[]>("app_bot/available", {
    query: spaceId ? { space_id: spaceId } : undefined,
  });
  return Array.isArray(resp) ? resp.filter((b) => b && b.uid && b.id) : [];
}

export async function applyBot(robotUid: string): Promise<void> {
  await api("app_bot/apply", { method: "POST", body: { robot_uid: robotUid } });
}
