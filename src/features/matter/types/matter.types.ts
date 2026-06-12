/**
 * Matter 模块类型定义,字段对齐 todos service `model.Matter` JSON。
 *
 * 来源:旧项目 packages/dmworktodo/src/bridge/types.ts(精简,P3 MVP 不含 timeline /
 * activities / extract / attachments / channel linking,后续 wave 再补)。
 */

// ─── 状态枚举 ─────────────────────────────────────────────

export type MatterStatus = "open" | "done" | "archived";

// ─── 频道类型常量 ─────────────────────────────────────────

/** 普通群 */
export const CHANNEL_TYPE_GROUP = 2 as const;
/** 子区(thread) */
export const CHANNEL_TYPE_THREAD = 5 as const;

// ─── 活动动作类型 ─────────────────────────────────────────

export type MatterAction =
  | "created"
  | "title_changed"
  | "description_changed"
  | "status_changed"
  | "assignee_added"
  | "assignee_removed"
  | "deadline_changed"
  | "channel_linked"
  | "channel_unlinked";

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
  /**
   * 同步进展者 uid。与 msgs 一起传时,后端走 LLM 抽取进展摘要写入 timeline
   * (对齐旧 dmworktodo:多选消息"同步到事项"不写原文,而是 LLM 提炼摘要)。
   */
  participant_uid?: string;
  /** 原始消息列表,交给后端 LLM 抽取进展摘要(而非前端拼接原文)。 */
  msgs?: ExtractMessage[];
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
  action: MatterAction;
  detail: Record<string, unknown> | null;
  created_at: string;
}

// ─── Extract(AI 智能创建,对应旧 dmworktodo bridge/types.ts ExtractMatterReq/Result)─

export interface ExtractMessageAttachment {
  file_name: string;
  file_url: string;
  /** 文件大小(字节)。后端据此填充产出文件的大小列,缺失则展示横杠。 */
  file_size?: number;
  /** 文件 MIME / 扩展名,后端用于图标与类型判断。 */
  mime_type?: string;
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
  /** 时间戳(ms),与 Matter.deadline(RFC3339 string)格式不同 — 后端 extract 接口返回的是 unix 毫秒 */
  deadline?: number | null;
  status: MatterStatus;
  created_at: string;
}

// ─── Outputs (产出文件) ─────────────────────────────────

/**
 * MatterOutput — 产出文件条目。
 * 后端 GET /matters/:id/outputs 返回的去重文件列表。
 * 按 sent_at DESC, id DESC 排序; 同一 file_url 只保留最早的行。
 *
 * source_channel_id 是 IM 的 channel_id (非 matter_channels.id UUID)。
 * 前端做 channel 反查时按 matter.channels[].channel_id 匹配。
 */
export interface MatterOutput {
  id: string;
  entry_id: string;
  matter_id: string;
  file_url: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  description?: string;
  sender_uid: string;
  sender_uname: string;
  source_channel_id?: string;
  source_channel_name?: string;
  sent_at: string;
}

export interface ListOutputsParams {
  limit?: number;
  cursor?: string;
  q?: string;
}
