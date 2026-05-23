/**
 * Matter 模块类型定义,字段对齐 todos service `model.Matter` JSON。
 *
 * 来源:旧项目 packages/dmworktodo/src/bridge/types.ts(精简,P3 Wave 1 不含 timeline /
 * activities / extract /attachments,后续 wave 再补)。
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

export interface MatterChannel {
  id: string;
  matter_id: string;
  channel_id: string;
  channel_type: number;
  channel_name?: string;
  linked_by: string;
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
  channels?: MatterChannel[];
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
