import { t } from "@/lib/i18n/instance";

export function splitSummaryText(markdown: string, maxLen = 4500): string[] {
  if (!markdown.trim()) return [];

  let sections = splitByHeadings(markdown);
  if (sections.length === 1 && sections[0].length > maxLen) {
    sections = sections[0].split(/\n\n+/);
  }

  const chunks: string[] = [];
  for (const section of mergeSections(sections, maxLen)) {
    if (section.length <= maxLen) {
      chunks.push(section);
    } else {
      chunks.push(...hardCut(section, maxLen));
    }
  }
  if (chunks.length === 0) return [];

  const signature = `\n\n${t("summary.splitMessage.signature")}`;
  const last = chunks[chunks.length - 1];
  if (last.length + signature.length <= maxLen) {
    chunks[chunks.length - 1] = last + signature;
  } else {
    chunks.push(signature.trimStart());
  }
  return chunks;
}

function splitByHeadings(markdown: string): string[] {
  return markdown
    .split(/(?=^## )/m)
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeSections(sections: string[], maxLen: number): string[] {
  const result: string[] = [];
  let buffer = "";
  for (const section of sections) {
    const candidate = buffer ? `${buffer}\n\n${section}` : section;
    if (candidate.length <= maxLen) {
      buffer = candidate;
    } else {
      if (buffer) result.push(buffer);
      buffer = section;
    }
  }
  if (buffer) result.push(buffer);
  return result;
}

function hardCut(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let buffer = "";
  for (const char of text) {
    if ((buffer + char).length > maxLen) {
      if (buffer) chunks.push(buffer);
      buffer = char;
    } else {
      buffer += char;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks;
}
