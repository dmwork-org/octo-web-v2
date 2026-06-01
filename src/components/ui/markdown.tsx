import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

/**
 * 通用 Markdown 渲染器(对应旧 dmworkbase Messages/Text/MarkdownContent)。
 *
 * **依赖**:
 * - `react-markdown@10`
 * - `remark-gfm@4`(GFM:table / strikethrough / task list / autolinks)
 * - `remark-breaks@4`(单 `\n` → `<br>`,**chat 软换行关键**;对齐旧 MarkdownContent
 *   baseRemarkPlugins)
 *
 * **后处理 token 替换**(`tokens` prop):
 *   tokens = [{ match: '@张三', render: (key) => <MentionTag uid="..." /> }]
 * markdown 渲染完成后,在 React 树叶子文本节点上扫描 token 并替换,
 * 不破坏块级结构(table / list / code 都不受影响)。
 *
 * **不**预解析 `@xxx` / `[emoji]`:tokens 由调用方提供具体匹配规则(避免误识别)。
 */
export interface MarkdownToken {
  /** 精确匹配的字符串(如 "@张三"、"[有品位]")。 */
  match: string;
  /** 替换渲染。key 由调用方保证唯一性(通常 `${type}-${idx}`)。 */
  render: (key: string) => ReactNode;
}

interface MarkdownProps {
  content: string;
  tokens?: MarkdownToken[];
  /** 额外 className,允许调用方注入 prose 等排版 class。 */
  className?: string;
}

/**
 * fenced code block 内不能被 markdown 预处理(YAML 里的 `---` 误识别成 setext h2)。
 * 切分:奇数 idx 是 ```code```,偶数 idx 是普通文本可处理。
 */
function normalizeContent(raw: string): string {
  const parts = raw.split(/(```[\s\S]*?```)/g);
  const processed = parts.map((part, i) => {
    if (i % 2 === 1) return part;
    return part
      .replace(/([^\n])\n([-*_]{3,})\n/g, "$1\n\n$2\n\n")
      .replace(/(^|\n)([-*_]{3,})(\n|$)/g, "\n\n$2\n\n")
      .replace(/\n{3,}/g, "\n\n");
  });
  return processed.join("").trim();
}

/**
 * 按长度降序的 token 列表 + 字符串 → ReactNode[](命中处替换,其他保留原字符串)。
 * 单遍扫描;不命中按字符推进 — 与旧 `parseTextWithMentions` 同算法。
 */
function replaceTokensInString(text: string, tokens: MarkdownToken[]): ReactNode[] {
  if (!text || tokens.length === 0) return [text];
  const sorted = tokens.slice().sort((a, b) => b.match.length - a.match.length);
  const out: ReactNode[] = [];
  let buf = "";
  let i = 0;
  let nodeKey = 0;
  while (i < text.length) {
    let hit: MarkdownToken | null = null;
    for (const t of sorted) {
      if (text.startsWith(t.match, i)) {
        hit = t;
        break;
      }
    }
    if (hit) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      out.push(hit.render(`tk-${nodeKey++}`));
      i += hit.match.length;
    } else {
      buf += text[i];
      i++;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * 递归 children,叶子字符串节点跑 token 替换;非字符串/无 children 节点原样保留。
 * 不破坏 markdown 结构(table cell / list item / 段落内 token 都能识别)。
 */
function processChildren(children: ReactNode, tokens: MarkdownToken[]): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = replaceTokensInString(child, tokens);
      return parts.length === 1 && parts[0] === child ? child : parts;
    }
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children == null) return child;
      return cloneElement(
        child as React.ReactElement<{ children?: ReactNode }>,
        {},
        processChildren(props.children, tokens),
      );
    }
    return child;
  });
}

/**
 * 复用 components:链接补 target=_blank rel=noopener;
 * 其他标签透传 children 时跑 processChildren 做 token 替换。
 *
 * 不显式枚举所有 markdown 标签 — react-markdown 默认 components 已经把 children
 * 一路透传,我们只在**有 tokens** 时给少数高频块级标签套个 wrapper 走 process。
 */
function buildComponents(tokens: MarkdownToken[]): Components {
  const process = (children: ReactNode) => processChildren(children, tokens);
  const wrap =
    <T extends keyof React.JSX.IntrinsicElements>(Tag: T) =>
    ({ children, node: _node, ...rest }: { children?: ReactNode; node?: unknown }) => {
      const processed = tokens.length > 0 ? process(children) : children;
      const Component = Tag as unknown as React.ElementType;
      return <Component {...rest}>{processed}</Component>;
    };
  return {
    a: ({ children, href, node: _node, ...rest }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-text-accent underline underline-offset-2 hover:opacity-80"
        {...rest}
      >
        {tokens.length > 0 ? process(children) : children}
      </a>
    ),
    p: wrap("p"),
    li: wrap("li"),
    td: wrap("td"),
    th: wrap("th"),
    h1: wrap("h1"),
    h2: wrap("h2"),
    h3: wrap("h3"),
    h4: wrap("h4"),
    h5: wrap("h5"),
    h6: wrap("h6"),
  };
}

/**
 * 内置基础样式 — 不引 Tailwind typography 插件,避免改 build config;
 * 用 `*:` 子选择器把 markdown 元素样式约束在 `.wk-md` scope 内。
 *
 * 字号/行距对齐旧 markdown.css(line-height 1.6 舒展,headings em 缩放):
 * - 整体 `leading-[1.6]`(对应 wk-markdown line-height: 1.6)
 * - headings 用 em 跟父字号 14px 缩放(h1 1.4em / h2 1.25em / h3 1.1em / h4-6 1em)
 * - 段落 mb-sp-2 = 8px(my-2),最后一段无 mb
 * - lists pl-5 = 20px,li mb-sp-1 = 4px
 * - blockquote 紫色左边 + ai-surface bg
 */
const MD_CLASS = [
  "wk-md text-sm leading-[1.6] text-text-primary break-words",
  // headings
  "[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:text-[1.4em] [&_h1]:leading-[1.3] [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:text-[1.25em] [&_h2]:leading-[1.3] [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:text-[1.1em] [&_h3]:leading-[1.3] [&_h3]:font-semibold",
  "[&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-[1em] [&_h4]:leading-[1.3] [&_h4]:font-semibold",
  "[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0",
  // paragraph spacing(舒展,8px 段落间)
  "[&_p]:mb-2 [&_p:last-child]:mb-0",
  // lists
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:mb-1 [&_li:last-child]:mb-0",
  // inline code
  "[&_code]:rounded-sm [&_code]:bg-bg-elevated [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[12.5px]",
  // code block
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-bg-elevated [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12.5px] [&_pre_code]:leading-[1.6]",
  // blockquote
  "[&_blockquote]:my-2 [&_blockquote]:border-l-[3px] [&_blockquote]:border-l-[rgba(127,59,245,0.25)] [&_blockquote]:bg-[rgba(127,59,245,0.03)] [&_blockquote]:px-3 [&_blockquote]:py-2 [&_blockquote]:rounded-r-sm [&_blockquote]:text-text-secondary",
  // tables(GFM)
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]",
  "[&_th]:border [&_th]:border-border-default [&_th]:bg-bg-elevated [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
  "[&_td]:border [&_td]:border-border-default [&_td]:px-2 [&_td]:py-1",
  // hr
  "[&_hr]:my-2 [&_hr]:border-border-subtle",
  // images(防超宽)
  "[&_img]:max-w-full [&_img]:rounded-sm",
].join(" ");

export function Markdown({ content, tokens = [], className }: MarkdownProps) {
  const normalized = normalizeContent(content);
  const components = buildComponents(tokens);
  return (
    <div className={`${MD_CLASS}${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
