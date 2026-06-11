import type { LocalTopicTemplate } from "@/features/summary/types/summary.types";

/**
 * 前端兜底 topic 模板列表(后端 `/summary-templates` 返回空时用)。
 *
 * - `id` 跟后端 template id 对齐(snake_case),便于按 id 替换为后端版。
 * - `*Key` 字段存 i18n key(去 `summary.` 前缀),由 `resolveTemplate` 在
 *   render() 期按当前 locale 解析,切语言即时刷新。
 * - `parameterized` 类型有 placeholder,UI 自动定位首个 token 选区。
 */
export const TOPIC_TEMPLATES: LocalTopicTemplate[] = [
  {
    id: "project_progress",
    icon: "FileText",
    type: "parameterized",
    labelKey: "templates.project_progress.label",
    descriptionKey: "templates.project_progress.description",
    patternKey: "templates.project_progress.pattern",
    placeholders: [
      {
        key: "project_name",
        labelKey: "templates.project_progress.placeholder",
        position: [3, 9],
      },
    ],
  },
  {
    id: "task_tracking",
    icon: "ListChecks",
    type: "parameterized",
    labelKey: "templates.task_tracking.label",
    descriptionKey: "templates.task_tracking.description",
    patternKey: "templates.task_tracking.pattern",
    placeholders: [
      {
        key: "task_name",
        labelKey: "templates.task_tracking.placeholder",
        position: [3, 9],
      },
    ],
  },
  {
    id: "weekly_report",
    icon: "Calendar",
    type: "fixed",
    labelKey: "templates.weekly_report.label",
    descriptionKey: "templates.weekly_report.description",
    patternKey: "templates.weekly_report.pattern",
  },
  {
    id: "chat_content",
    icon: "MessageSquare",
    type: "fixed",
    labelKey: "templates.chat_content.label",
    descriptionKey: "templates.chat_content.description",
    patternKey: "templates.chat_content.pattern",
  },
];

/** chat-selector 多选弹窗最大可选数(对齐老仓 `MAX_CHAT_SELECT`)。 */
export const MAX_CHAT_SELECT = 30;
