import { api } from "@/features/base/api/client";

/**
 * Space-level 用户设置(对应 octo-server `modules/user/api_space_setting.go`):
 *
 *   GET  /v1/user/space/setting   →  { voice_input_enabled, voice_feedback_on, voice_feedback_notice_acked }
 *   PUT  /v1/user/space/setting   body 部分字段(只更新传的)
 *
 * Space 隔离:走 SpaceMiddleware 自动读 X-Space-Id header,**当前 space 维度**存储。
 *
 * 设置字段(对齐上游 c0a6f1ea / db_space_setting.go):
 *   - voice_input_enabled:0/1  voice 录音输入总开关(空间维度)
 *   - voice_feedback_on:0/1     允许上报 voice ASR 反馈(隐私 opt-in)
 *   - voice_feedback_notice_acked:0/1  用户已读隐私 notice(避免重复弹)
 */

export interface SpaceSetting {
  voice_input_enabled: number;
  voice_feedback_on: number;
  voice_feedback_notice_acked: number;
}

export async function getSpaceSetting(): Promise<SpaceSetting> {
  return api<SpaceSetting>("user/space/setting");
}

export async function updateSpaceSetting(body: Partial<SpaceSetting>): Promise<void> {
  await api("user/space/setting", { method: "PUT", body });
}
