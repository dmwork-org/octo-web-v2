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

// ParticipantStatus 与旧版对齐:0 待确认 / 1 已确认 / 2 已拒绝
export const ParticipantStatus = {
  PENDING: 0,
  CONFIRMED: 1,
  DECLINED: 2,
} as const;

/** 个人模式成员状态(旧 MemberStatus,Wave 3c)。 */
export interface MemberStatus {
  user_id: string;
  user_name: string;
  status: string;
  submitted_at: string | null;
  content?: string;
  citations?: CitationItem[];
}

/** 个人模式当前用户视角的总结结果(Wave 3c)。 */
export interface PersonalResult {
  worker_status: 0 | 1 | 2 | 3;
  content: string;
  citations?: CitationItem[];
  submitted_at: string | null;
  generated_at: string | null;
  msg_count: number;
}

export interface SummaryResult {
  content: string;
  total_msg_count: number;
  total_token_used: number;
  model_version: string;
  version: number;
  generated_at: string | null;
  citations?: CitationItem[];
}

// ─── Citation(Wave 3a) ───────────────────────────────────

export interface CitationContextMessage {
  sender: string;
  content: string;
  sent_at: string;
  message_seq?: number;
}

export interface CitationItem {
  index: number;
  sender: string;
  content: string;
  sent_at: string;
  source: string;
  channel_id?: string;
  message_seq?: number;
  channel_type?: number;
  context_before?: CitationContextMessage[];
  context_after?: CitationContextMessage[];
}

export interface SummaryListItem {
  task_id: number;
  task_no: string;
  title: string;
  summary_mode: SummaryModeType;
  status: TaskStatusType;
  trigger_type: number;
  schedule_id?: number;
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
  origin_channel_id?: string;
  origin_channel_type?: number;
  created_at: string;
  updated_at: string;
  result_id?: number;
  result_edited_at?: string | null;
  result_is_edited?: boolean;
  permissions?: {
    can_edit: boolean;
  };
}

// ─── 请求 ─────────────────────────────────────────────────

export interface TimeRange {
  start: string;
  end: string;
}

export interface CreateSummaryParams {
  topic: string;
  /** 老仓 CreateSummary handler 当 title 为空时回退到 topic,前端可省略。 */
  title?: string;
  summary_mode?: SummaryModeType;
  time_range?: TimeRange;
  sources?: SourceItem[];
  participants?: { user_id: string }[];
  confirm_timeout_hours?: number;
  /**
   * Chat 上下文创建总结时透传当前 channel:让后端 listSummaries(origin_channel_id)
   * 能查回当前会话的总结历史(对齐老仓 ChatSummaryStarButton.fetchSummaryCount)。
   * 后端 OriginChannelType 1=Group / 2=Thread / 3=DM(SourceType 枚举,**不是** WK
   * SDK channelType:1=Person / 2=Group / 5=Thread,直接传 channelType 会被后端
   * 400 拒收 thread)。
   */
  origin_channel_id?: string;
  origin_channel_type?: SourceTypeValue;
}

export interface ListSummariesParams {
  page?: number;
  page_size?: number;
  status?: TaskStatusType;
  summary_mode?: SummaryModeType;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  keyword?: string;
  /** 按 chat 过滤:仅返回 origin_channel_id == 此 channelID 的总结(chat panel 用)。 */
  origin_channel_id?: string;
}

export interface ListSummariesResponse {
  items: SummaryListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Schedule(Wave 3b 定时任务) ───────────────────────

export type TimeRangeTypeValue = 1 | 2 | 3 | 4;

/**
 * TimeRangeTypeValue → i18n key 映射(替代旧 TimeRangeTypeLabel 硬编码字典)。
 * UI 用 `t(TIME_RANGE_TYPE_KEY[v])` 取本地化文案,locale 切换即时刷新。
 */
export const TIME_RANGE_TYPE_KEY: Record<TimeRangeTypeValue, string> = {
  1: "summary.timeRange.last24h",
  2: "summary.timeRange.last7d",
  3: "summary.timeRange.last30d",
  4: "summary.timeRange.sinceLastSummary",
};

export interface ScheduleItem {
  schedule_id: number;
  title: string;
  summary_mode: SummaryModeType;
  cron_expr: string;
  interval_days?: number;
  interval_months?: number;
  day_of_week?: number;
  day_of_month?: number;
  run_time?: string;
  time_range_type: TimeRangeTypeValue;
  sources: SourceItem[];
  participants: { user_id: string }[];
  is_active: boolean;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleParams {
  title: string;
  summary_mode: SummaryModeType;
  cron_expr: string;
  interval_days?: number;
  interval_months?: number;
  day_of_week?: number;
  day_of_month?: number;
  run_time?: string;
  time_range_type: TimeRangeTypeValue;
  sources: SourceItem[];
  participants?: { user_id: string }[];
  /** Task-scoped create atomically binds the new schedule to a summary task. */
  scope?: "task";
  task_id?: number;
}

export interface UpdateScheduleParams {
  title?: string;
  summary_mode?: SummaryModeType;
  cron_expr?: string;
  interval_days?: number;
  interval_months?: number;
  day_of_week?: number;
  day_of_month?: number;
  run_time?: string;
  time_range_type?: TimeRangeTypeValue;
  sources?: SourceItem[];
  participants?: { user_id: string }[];
  scope?: "task";
  task_id?: number;
}

export type ScheduleUnit = "day" | "week" | "month";

export interface ScheduleConfig {
  unit: ScheduleUnit;
  every: number;
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  legacyCron?: boolean;
}

// ─── Batch status / chat-context types(Batch 1.11 chat panel) ─────────────

/** batch-status 单项响应。 */
export interface BatchStatusItem {
  id: number;
  status: TaskStatusType;
}

export interface BatchStatusResponse {
  tasks: BatchStatusItem[];
}

/** 聊天候选项(chat-selector 多选弹窗用,对齐老仓 ChatCandidate)。 */
export interface ChatCandidate {
  chat_id: string;
  chat_type: "group" | "direct" | "thread";
  name: string;
  member_count: number | null;
  parent_group_no?: string;
  is_bot?: boolean;
  is_archived?: boolean;
}

/** 成员候选项(member-selector 用,Wave 3+)。 */
export interface MemberCandidate {
  user_id: string;
  name: string;
  avatar: string;
  department: string;
}

// ─── Topic templates(chat-context 创建总结的模板卡片) ───────────────────

export interface TopicTemplatePlaceholder {
  key: string;
  label: string;
  position?: [number, number];
}

/**
 * 已本地化的明文 topic template(来自后端 /summary-templates 或前端 resolve 后)。
 * UI(TemplateCard / ChatSummaryNewModal) 直接消费。
 */
export interface TopicTemplate {
  id: string;
  label: string;
  icon: string;
  description: string;
  type: "fixed" | "parameterized";
  pattern: string;
  placeholders?: TopicTemplatePlaceholder[];
}

export interface LocalTopicTemplatePlaceholder {
  key: string;
  labelKey: string;
  position?: [number, number];
}

/**
 * 前端离线兜底 topic template:字段存 i18n key 而非明文,render() 期由
 * resolveTemplate 用当前 locale 解析为明文 TopicTemplate,保证切语言即时刷新。
 */
export interface LocalTopicTemplate {
  id: string;
  icon: string;
  type: "fixed" | "parameterized";
  labelKey: string;
  descriptionKey: string;
  patternKey: string;
  placeholders?: LocalTopicTemplatePlaceholder[];
}
