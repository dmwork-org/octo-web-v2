import type {
  LocalTopicTemplate,
  TopicTemplate,
  TopicTemplatePlaceholder,
} from "@/features/summary/types/summary.types";

type TranslateFn = (
  key: string,
  options?: { values?: Record<string, unknown>; defaultValue?: string },
) => string;

/** 解析期接受两态:前端 LocalTopicTemplate(含 i18n key 字段)或后端明文 TopicTemplate。 */
export type ResolvableTemplate = LocalTopicTemplate | TopicTemplate;

function isLocalTemplate(template: ResolvableTemplate): template is LocalTopicTemplate {
  return typeof (template as LocalTopicTemplate).labelKey === "string";
}

/**
 * 把模板解析为已本地化的明文 TopicTemplate。
 *
 * - LocalTopicTemplate(含 *Key):用 `summary.` 前缀的 i18n key 经 `t` 解析。
 * - 已是明文 TopicTemplate(无 *Key,来自后端 / 测试 mock):原样透传。
 *
 * 在 render() 期统一过一遍,locale 切换即时刷新(不在 state 烘焙明文)。
 */
export function resolveTemplate(template: ResolvableTemplate, t: TranslateFn): TopicTemplate {
  if (!isLocalTemplate(template)) {
    return template;
  }
  const placeholders: TopicTemplatePlaceholder[] | undefined = template.placeholders?.map((ph) => ({
    key: ph.key,
    label: t(`summary.${ph.labelKey}`),
    position: ph.position,
  }));
  return {
    id: template.id,
    icon: template.icon,
    type: template.type,
    label: t(`summary.${template.labelKey}`),
    description: t(`summary.${template.descriptionKey}`),
    pattern: t(`summary.${template.patternKey}`),
    placeholders,
  };
}

/**
 * 基于已本地化的明文模板,生成填入输入框的文本 + 首个 placeholder 选区。
 *
 * - text:把全部 `{key}` token 依次替换成对应 label,避免多 placeholder 模板
 *   留未替换 token(对齐老仓 applyTemplate)。
 * - range:在 pattern 中定位首个 placeholder token,得到选区
 *   `[tokenStart, tokenStart + label.length]`;token 找不到时回退到
 *   `placeholder.position`(后端老数据兜底),仍无则 null。
 */
export function computeTemplateSelection(template: TopicTemplate): {
  text: string;
  range: [number, number] | null;
} {
  const pattern = template.pattern;
  const placeholders = template.placeholders ?? [];

  let text = pattern;
  for (const ph of placeholders) {
    text = text.replace(`{${ph.key}}`, ph.label);
  }

  if (template.type !== "parameterized" || placeholders.length === 0) {
    return { text, range: null };
  }

  const first = placeholders[0];
  const tokenStart = pattern.indexOf(`{${first.key}}`);
  if (tokenStart !== -1) {
    return { text, range: [tokenStart, tokenStart + first.label.length] };
  }
  return { text, range: first.position ?? null };
}
