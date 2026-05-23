import { api } from "@/features/base/api/client";

/**
 * Robot(AI bot)相关 endpoints。
 *
 * - GET /v1/robot/my_bots?space_id  → 我已添加的 AI 列表
 * - GET /v1/robot/space_bots?space_id → 当前 Space 内可见的所有 AI(可加可不加)
 *
 * Bot.status:"added" | "pending" | "not_added";前端基于此渲染加号 / 转圈 / 已添加。
 */

export interface RobotBot {
  uid: string;
  name: string;
  avatar?: string;
  description?: string;
  status?: "added" | "pending" | "not_added";
  username?: string;
  category?: string;
}

export async function getMyBots(spaceId: string): Promise<RobotBot[]> {
  const resp = await api<RobotBot[]>("robot/my_bots", {
    query: { space_id: spaceId },
  });
  return resp ?? [];
}

export async function getSpaceBots(spaceId: string): Promise<RobotBot[]> {
  const resp = await api<RobotBot[]>("robot/space_bots", {
    query: { space_id: spaceId },
  });
  return resp ?? [];
}
