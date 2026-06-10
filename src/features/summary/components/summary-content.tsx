import type { AnchorHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

interface SummaryContentProps {
  content: string;
}

export const summaryMarkdownClass =
  "text-sm leading-7 text-text-primary [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline [&_blockquote]:my-3.5 [&_blockquote]:rounded-sm [&_blockquote]:border-l-4 [&_blockquote]:border-brand [&_blockquote]:bg-bg-elevated [&_blockquote]:px-3.5 [&_blockquote]:py-2.5 [&_blockquote]:text-text-secondary [&_code]:rounded [&_code]:bg-bg-elevated [&_code]:px-2 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-error [&_em]:text-text-secondary [&_em]:italic [&_h1]:mb-3.5 [&_h1]:mt-5 [&_h1]:border-b-2 [&_h1]:border-border-subtle [&_h1]:pb-1.5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2.5 [&_h2]:mt-[18px] [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border-subtle [&_li]:my-1.5 [&_li]:leading-6 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_p]:leading-7 [&_pre]:my-3.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border-subtle [&_pre]:bg-bg-elevated [&_pre]:p-3.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_strong]:font-semibold [&_strong]:text-text-primary [&_table]:my-3.5 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-md [&_table]:border [&_table]:border-border-default [&_td]:border [&_td]:border-border-default [&_td]:bg-bg-base [&_td]:px-3 [&_td]:py-2 [&_td]:text-left [&_th]:border [&_th]:border-border-default [&_th]:bg-bg-elevated [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-6";

const remarkPlugins: PluggableList = [remarkGfm, remarkBreaks];
const rehypePlugins: PluggableList = [rehypeSanitize];

type MarkdownAnchorProps = AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

const components: Components = {
  a: ({ node: _node, href, children, ...props }: MarkdownAnchorProps) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

/**
 * Summary 总结正文 markdown 渲染。
 * 对齐上游:react-markdown + gfm + breaks + sanitize,链接新窗口打开。
 */
export function SummaryContent({ content }: SummaryContentProps) {
  const normalized = content.trim();
  if (!normalized) return null;
  return (
    <div className={summaryMarkdownClass}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
