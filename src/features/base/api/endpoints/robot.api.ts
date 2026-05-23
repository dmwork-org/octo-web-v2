import { api } from "@/features/base/api/client";
import { authStore } from "@/features/base/stores/auth";

/**
 * Robot(AI bot)相关 endpoints。
 *
 * - GET    /v1/robot/my_bots?space_id     → 我已添加的 AI 列表
 * - GET    /v1/robot/space_bots?space_id  → 当前 Space 内可见的所有 AI
 * - PUT    /v1/robot/{uid}/description    → 更新 bot 简介(仅 owner)
 * - POST   /v1/users/{uid}/avatar         → multipart 上传头像(仅 owner)
 * - GET    /v1/agent-cards/{uid}/report-status → OctoPush 上报状态(envelope unwrap)
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

/** 更新 bot 简介(只有 bot 创建者能调,后端鉴权)。 */
export async function setBotDescription(uid: string, description: string): Promise<void> {
  await api(`robot/${encodeURIComponent(uid)}/description`, {
    method: "PUT",
    body: { description },
  });
}

/**
 * 上传 bot 头像(也用于普通用户头像)。
 * **不**走 ofetch 默认 JSON 序列化 — 用 fetch+FormData,token 直接读 authStore。
 * 路径前缀对齐 base client(走 vite proxy /v1)。
 */
export async function uploadUserAvatar(uid: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const token = authStore.state.token ?? "";
  const resp = await fetch(`/v1/users/${encodeURIComponent(uid)}/avatar`, {
    method: "POST",
    headers: { token },
    body: form,
  });
  if (!resp.ok) {
    throw new Error("头像上传失败");
  }
}

/**
 * OctoPush 上报状态(对应旧 AgentCardService::getReportStatus)。
 * GET /v1/agent-cards/{botId}/report-status
 * 响应:`{ code, message, data: { reported: boolean } }`
 *
 * **静默失败**:对齐旧 BotDetailModal.loadReportStatus 行为,接口不存在 / 网络
 * 错误 / code !== 0 时返 `null`(不报 toast,不冒泡 error,UI 不显示 chip)。
 *
 * 这个接口部署在独立 agent-card-server,测试环境通常没接入,404 是预期场景。
 * **故意绕过 base/api/client** 的全局 withErrorToast 拦截器,用裸 fetch + 手动
 * 注入 token(同 uploadUserAvatar 思路)。
 */
export async function getAgentReportStatus(botUid: string): Promise<boolean | null> {
  try {
    const token = authStore.state.token ?? "";
    const resp = await fetch(`/v1/agent-cards/${encodeURIComponent(botUid)}/report-status`, {
      headers: { token },
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as {
      code?: number;
      message?: string;
      data?: { reported: boolean };
    };
    if (body.code !== 0) return null;
    return body.data?.reported ?? null;
  } catch {
    return null;
  }
}
