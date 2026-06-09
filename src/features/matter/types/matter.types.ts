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

/** Matter 关联群聊条目(来自 GET /matters/:id 返回的 channels 字段)。 */
export interface MatterChannel {
  id: string;
  matter_id: string;
  channel_id: string;
  channel_type: number;
  channel_name?: string;
  linked_by: string;
  created_at: string;
}

/** 关联群聊请求体(POST /matters/:id/channels)。 */
export interface LinkChannelReq {
  channel_id: string;
  channel_type: number;
  channel_name?: string;
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
  /** 关联群聊列表,包含 source_channel 在内(后端统一返回)。 */
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
  /** 原消息 ID 列表，用于"查看原消息上下文"。 */
  source_msgs?: string[];
  created_at: string;
  attachments?: TimelineAttachment[];
}

export interface AddTimelineReq {
  content?: string;
  channel_id?: string;
  channel_type?: number;
  channel_name?: string;
}

// ─── Activities(变更记录,字段对齐后端 model.MatterActivity)──────

/**
 * MatterActivity — 事项变更审计日志条目。后端 todos PR #39。
 *
 * action 类型示例:created / title_changed / description_changed /
 * deadline_changed / status_changed / assignee_added / assignee_removed /
 * channel_linked / channel_unlinked。
 *
 * detail 结构按 action 变化,例如:
 *   title_changed: { from, to }
 *   status_changed: { from, to }
 *   assignee_added: { uid }
 *   channel_linked: { channel_id, channel_name }
 */
export interface ActivityEntry {
  id: string;
  matter_id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// ─── Extract(AI 智能创建,对应旧 dmworktodo bridge/types.ts ExtractMatterReq/Result)─

export interface ExtractMessageAttachment {
  file_name: string;
  file_url: string;
}

export interface ExtractMessage {
  message_id: string;
  from_uid: string;
  from_uname?: string;
  timestamp?: number;
  content?: string;
  attachments?: ExtractMessageAttachment[];
}

export interface ExtractMatterReq {
  channel_type: number;
  channel_id: string;
  channel_name?: string;
  creator_uid: string;
  msgs: ExtractMessage[];
}

export interface ExtractResult {
  id: string;
  seq_no: number;
  title: string;
  description: string;
  source_msgs: string[];
  deadline?: number | null;
  status: string;
  created_at: string;
}
