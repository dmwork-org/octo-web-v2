/**
 * Summary 模块类型(对齐旧 dmworksummary/types/summary.ts 精简版,仅 Wave 1 列表 +
 * 详情 + 删除需要的字段;创建 / regen / schedule / template / personal 全 Wave 2+)。
 */

// ─── 状态枚举 ─────────────────────────────────────────────

export const TaskStatus = {
  PENDING: 0,
  WAITING_CONFIRM: 1,
  PROCESSING: 2,
  COMPLETED: 3,
  FAILED: 4,
  CANCELLED: 5,
} as const;
export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus];

export const SummaryMode = {
  BY_GROUP: 1,
  BY_PERSON: 2,
} as const;
export type SummaryModeType = (typeof SummaryMode)[keyof typeof SummaryMode];

export const TriggerType = {
  MANUAL: 1,
  SCHEDULED: 2,
} as const;

export const SourceType = {
  GROUP_CHAT: 1,
  THREAD: 2,
  DIRECT_MESSAGE: 3,
} as const;
export type SourceTypeValue = (typeof SourceType)[keyof typeof SourceType];

// ─── 模型 ─────────────────────────────────────────────────

export interface SourceItem {
  source_type: SourceTypeValue;
  source_id: string;
  source_name?: string;
}

export interface Participant {
  user_id: string;
  user_name?: string;
  status?: number;
  confirmed_at?: string | null;
}

export interface SummaryResult {
  content: string;
  total_msg_count: number;
  total_token_used: number;
  model_version: string;
  version: number;
  generated_at: string | null;
}

export interface SummaryListItem {
  task_id: number;
  task_no: string;
  title: string;
  summary_mode: SummaryModeType;
  status: TaskStatusType;
  trigger_type: number;
  time_range_start: string;
  time_range_end: string;
  sources: SourceItem[];
  participants?: Participant[];
  total_msg_count: number;
  creator_name?: string;
  created_at: string;
  completed_at: string | null;
}

export interface SummaryDetail {
  task_id: number;
  task_no: string;
  title: string;
  summary_mode: SummaryModeType;
  status: TaskStatusType;
  trigger_type: number;
  time_range_start: string;
  time_range_end: string;
  sources: SourceItem[];
  participants: Participant[];
  result: SummaryResult | null;
  error_message: string | null;
  schedule_id?: number;
  created_at: string;
  updated_at: string;
}

// ─── 请求 ─────────────────────────────────────────────────

export interface ListSummariesParams {
  page?: number;
  page_size?: number;
  status?: TaskStatusType;
  summary_mode?: SummaryModeType;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  keyword?: string;
}

export interface ListSummariesResponse {
  items: SummaryListItem[];
  total: number;
  page: number;
  page_size: number;
}
