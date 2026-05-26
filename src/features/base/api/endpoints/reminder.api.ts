import { api } from "@/features/base/api/client";

/**
 * 消息提醒(Reminder)— @我 / 入群申请 / 任务提醒等的服务端推送源。
 *
 * 对应旧 dmworkdatasource/module.ts::syncRemindersCallback +
 *   reminderDoneCallback。
 *
 * POST /v1/message/reminder/sync { version, limit, channel_ids }
 *   → 按 version 增量同步,channel_ids 通常传我当前会话列表里 group/thread 的 ID
 *   (后端只回这些 channel 内的 reminder,带宽友好)
 *   返回 raw[]:每个 reminder 含 channel_id/channel_type/message_id/reminder_type/
 *   text/data/is_locate/version/done
 *
 * POST /v1/message/reminder/done body: [reminderId, ...]
 *   → 把对应 reminder 标记为已完成(用户点了"@提醒" 跳到原消息后)
 */

export interface ReminderRaw {
  id: number;
  channel_id: string;
  channel_type: number;
  message_id: string;
  message_seq: number;
  reminder_type: number; // 1 ReminderTypeMentionMe / 2 ReminderTypeApplyJoinGroup
  text?: string;
  data?: unknown;
  is_locate?: number;
  version: number;
  done?: number;
}

export interface SyncRemindersReq {
  version: number;
  limit?: number;
  channel_ids?: string[];
}

export async function syncReminders(req: SyncRemindersReq): Promise<ReminderRaw[]> {
  const resp = await api<ReminderRaw[] | null>("message/reminder/sync", {
    method: "POST",
    body: {
      version: req.version,
      limit: req.limit ?? 100,
      channel_ids: req.channel_ids ?? [],
    },
  });
  return resp ?? [];
}

export async function markRemindersDone(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await api("message/reminder/done", { method: "POST", body: ids });
}
