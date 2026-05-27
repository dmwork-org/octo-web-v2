/**
 * Matter 模块类型定义,字段对齐 todos service `model.Matter` JSON。
 *
 * 来源:旧项目 packages/dmworktodo/src/bridge/types.ts(精简,P3 MVP 不含 timeline /
 * activities / extract / attachments / channel linking,后续 wave 再补)。
 */

// ─── 状态枚举 ─────────────────────────────────────────────

export type MatterStatus = "open" | "done" | "archived";

// ─── 核心模型 ─────────────────────────────────────────────

export interface MatterAssignee {
  id: string;
  matter_id: string;
  user_id: string;
  created_at: string;
}

export interface Matter {
  id: string;
  seq_no: number;
  space_id: string;
  title: string;
  description?: string;
  creator_id: string;
  status: MatterStatus;
  deadline?: string;
  remind_at?: string;
  source_channel_id?: string;
  source_channel_type?: number;
  source_name?: string;
  source_msgs?: string[];
  assignees?: MatterAssignee[];
  created_at: string;
  updated_at: string;
}

export interface MatterDetail extends Matter {
  assignees: MatterAssignee[];
  participants?: string[];
}

// ─── 分页 ─────────────────────────────────────────────────

export interface Pagination {
  has_more: boolean;
  next_cursor?: string;
}

export interface PaginatedList<T> {
  data: T[];
  pagination: Pagination;
}

// ─── 请求类型 ─────────────────────────────────────────────

export interface MatterListParams {
  status?: MatterStatus;
  assignee_id?: string;
  creator_id?: string;
  source_channel_id?: string;
  source_channel_type?: number;
  channel_id?: string;
  q?: string;
  limit?: number;
  cursor?: string;
}

export interface CreateMatterReq {
  title: string;
  description?: string;
  assignee_ids?: string[];
  source_channel_id?: string;
  source_channel_type?: number;
  source_name?: string;
  deadline?: string;
  remind_at?: string;
}

export interface UpdateMatterReq {
  title?: string;
  description?: string | null;
  deadline?: string | null;
  remind_at?: string | null;
}

// ─── Timeline(评论 / 时间线)─────────────────────────────

export interface TimelineAttachment {
  id: string;
  entry_id: string;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  matter_id: string;
  user_id: string;
  content: string | null;
  channel_id?: string;
  channel_type?: number;
  source_channel_id?: string;
  related_uids?: string[];
  created_at: string;
  attachments?: TimelineAttachment[];
}

export interface AddTimelineReq {
  content?: string;
  channel_id?: string;
  channel_type?: number;
  channel_name?: string;
}

// ─── Activities(变更记录)──────────────────────────────

export interface ActivityEntry {
  id: string;
  matter_id: string;
  user_id: string;
  type: string;
  payload?: Record<string, unknown>;
  created_at: string;
}
