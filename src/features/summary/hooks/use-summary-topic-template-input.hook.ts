import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { t } from "@/lib/i18n/instance";
import { getTopicTemplates } from "@/features/summary/api/summary.api";
import { TOPIC_TEMPLATES } from "@/features/summary/constants/topic-templates";
import {
  computeTemplateSelection,
  resolveTemplate,
  type ResolvableTemplate,
} from "@/features/summary/utils/template-resolver";
import type { TopicTemplate } from "@/features/summary/types/summary.types";

interface UseSummaryTopicTemplateInputOptions {
  enabled?: boolean;
  maxLength?: number;
}

export function useSummaryTopicTemplateInput({
  enabled = true,
  maxLength,
}: UseSummaryTopicTemplateInputOptions = {}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopicValue] = useState("");
  const [placeholderRange, setPlaceholderRange] = useState<[number, number] | null>(null);

  const { data: remoteTemplates } = useQuery({
    queryKey: ["summary", "topic-templates"],
    queryFn: () => getTopicTemplates(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const templates: ResolvableTemplate[] =
    remoteTemplates && remoteTemplates.length > 0 ? remoteTemplates : TOPIC_TEMPLATES;

  const resolvedTemplates = useMemo(
    () => templates.map((template) => resolveTemplate(template, t)),
    [templates],
  );

  const setTopic = useCallback(
    (value: string) => {
      setTopicValue(maxLength ? value.slice(0, maxLength) : value);
      setPlaceholderRange(null);
    },
    [maxLength],
  );

  const resetTopic = useCallback((value = "") => {
    setTopicValue(value);
    setPlaceholderRange(null);
  }, []);

  const handleTemplateClick = useCallback((template: TopicTemplate) => {
    const { text, range } = computeTemplateSelection(template);
    setTopicValue(text);
    setPlaceholderRange(range);
    setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      if (range) input.setSelectionRange(range[0], range[1]);
    }, 0);
  }, []);

  const handleTopicFocus = useCallback(() => {
    if (!placeholderRange) return;
    const [start, end] = placeholderRange;
    setTopicValue((prev) => prev.substring(0, start) + prev.substring(end));
    setPlaceholderRange(null);
    setTimeout(() => inputRef.current?.setSelectionRange(start, start), 0);
  }, [placeholderRange]);

  return {
    inputRef,
    topic,
    resolvedTemplates,
    setTopic,
    resetTopic,
    handleTemplateClick,
    handleTopicFocus,
  };
}
