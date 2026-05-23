import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SummaryContentProps {
  content: string;
}

/**
 * Summary 总结正文 markdown 渲染。
 * - react-markdown + remark-gfm(表格 / 任务列表 / 删除线 / autolink)
 * - prose 样式手写(Tailwind v4 没有 typography 插件,这里用最小集合保证可读性)
 * - 不接 highlight.js(Wave 3 加)
 * - 不接 citations(Wave 3 加自定义 component)
 */
export function SummaryContent({ content }: SummaryContentProps) {
  return (
    <div className="text-sm leading-relaxed text-text-primary [&_a]:text-brand [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border-default [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_hr]:my-3 [&_hr]:border-border-subtle [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-bg-elevated [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:border-collapse [&_table]:border [&_table]:border-border-default [&_td]:border [&_td]:border-border-default [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border-default [&_th]:bg-bg-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
