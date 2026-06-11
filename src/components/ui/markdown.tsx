import { Children, cloneElement, isValidElement, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import "./markdown.css";
import { ImagePreviewModal } from "@/features/chat/components/image-preview-modal";

/**
 * 通用 Markdown 渲染器(1:1 对齐旧 dmworkbase Messages/Text/MarkdownContent.tsx + markdown.css)。
 *
 * **依赖** + 旧仓行为复刻全集:
 *   - `react-markdown@10` + `remark-gfm@4`(table/strike/task list)+ `remark-breaks@4`(软换行)
 *   - `remark-math@6` + `rehype-katex@7` — 数学公式(opt-in `enableMath`)
 *   - `rehype-highlight@7` + `highlight.js@11` github-dark 主题 — 代码块语法高亮
 *   - `rehype-sanitize@6` + 白名单 — 兜底清洗 hljs/katex/SVG class
 *
 * **isStreaming**:渲染末尾追加 `.wk-stream-cursor` 闪烁竖线提示流式中。
 *
 * **isSend** / `wk-markdown-send` class:发送方气泡专属样式钩子(见 markdown.css)。
 *
 * **tokens 后处理**(`tokens` prop):
 *   tokens = [{ match: '@张三', render: (key) => <MentionTag uid="..." /> }]
 * markdown 渲染完成后,在 React 树叶子文本节点上扫描 token 并替换,
 * 不破坏块级结构(table / list / code 都不受影响)。
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
  /** 额外 className,允许调用方注入排版 class。 */
  className?: string;
  /** 是否发送方气泡(对齐旧 isSend),决定 `wk-markdown-send` vs `-recv` class。 */
  isSend?: boolean;
  /** 流式中显示闪烁光标(对齐旧 isStreaming)。 */
  isStreaming?: boolean;
  /** 启用数学公式渲染 KaTeX(对齐旧 enableMath,默认 false)。 */
  enableMath?: boolean;
}

/**
 * 在 GitHub 默认白名单基础上,追加 highlight.js / KaTeX 需要的 class 属性 + 标签。
 * 执行顺序:rehypeHighlight 先着色(加 `hljs-*` className),
 * rehypeSanitize 最后兜底清洗 — 白名单里的 `hljs-*` / `language-*` / `katex-*` 才生效。
 * 1:1 对齐旧 sanitizeSchema(完整覆盖 KaTeX 元素 + SVG)。
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className", /^language-/, /^hljs/]],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      [
        "className",
        /^hljs/,
        /^katex/,
        /^mord/,
        /^mbin/,
        /^mrel/,
        /^mopen/,
        /^mclose/,
        /^mpunct/,
        /^minner/,
        /^mop/,
        /^mfrac/,
        /^msqrt/,
        /^mroot/,
        /^mtable/,
        /^mtr/,
        /^mtd/,
        /^svg/,
        /^vlist/,
        /^strut/,
        /^frac-line/,
        /^delimsizing/,
        /^nulldelimiter/,
        /^reset-size/,
        /^sizing/,
        /^fontsize-ensurer/,
        /^base/,
      ],
    ],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^katex/]],
    math: [["className", /^katex/]],
    svg: [["width"], ["height"], ["viewBox"], ["preserveAspectRatio"], ["style"]],
    path: [["d"]],
    line: [["x1"], ["x2"], ["y1"], ["y2"]],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "svg",
    "path",
    "line",
    "math",
    "annotation",
    "semantics",
    "mrow",
    "mi",
    "mo",
    "mn",
    "msup",
    "msub",
    "mfrac",
    "mroot",
    "msqrt",
    "mtable",
    "mtr",
    "mtd",
  ],
};

/** rehype-* / remark-* plugin 类型在 react-markdown 里是 PluggableList,签名复杂,这里用 unknown[]。 */
type PluginList = readonly unknown[];

const baseRehypePlugins: PluginList = [
  [rehypeHighlight, { aliases: { json5: "json" }, ignoreMissing: true }],
  [rehypeSanitize, sanitizeSchema],
];

const mathRehypePlugins: PluginList = [
  [rehypeHighlight, { aliases: { json5: "json" }, ignoreMissing: true }],
  [rehypeKatex, { strict: false, throwOnError: false }],
  [rehypeSanitize, sanitizeSchema],
];

const baseRemarkPlugins: PluginList = [remarkGfm, remarkBreaks];
const mathRemarkPlugins: PluginList = [remarkGfm, remarkBreaks, remarkMath];

/**
 * 预处理 Markdown:把独占一行的 `---` / `===` 补前后空行,
 * 避免被解析成 setext 标题(h2/h1)。跳过 fenced code block 内的内容。
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

/** 按长度降序的 token 列表 + 字符串 → ReactNode[](命中处替换,其他保留原字符串)。 */
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

/** 递归 children,叶子字符串节点跑 token 替换;非字符串/无 children 节点原样保留。 */
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
 * 仅允许 http(s) / data 协议的图片(防 javascript:/blob: 等)。
 */
function isSafeImageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url, window.location.href);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "data:";
  } catch {
    return false;
  }
}

/**
 * Markdown 内联图(`![alt](url)`)— 对齐老仓 MarkdownContent MarkdownImage L279:
 *   - URL 安全过滤(http/https/data)— 不安全降级为 `[图片]` 文本占位
 *   - 缩略图最大 400×300 内联,object-contain 保比例
 *   - 点击复用项目共用 `<ImagePreviewModal>` 全屏 lightbox 预览
 */
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [preview, setPreview] = useState(false);
  if (!isSafeImageUrl(src) || !src) {
    return (
      <span className="inline-block rounded bg-bg-elevated px-2 py-1 text-[12px] text-text-tertiary">
        [图片]
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setPreview(true)}
        className="inline-block max-w-full overflow-hidden rounded-lg align-middle transition-opacity hover:opacity-90"
      >
        <img
          src={src}
          alt={alt || ""}
          className="block max-h-[300px] max-w-[400px] object-contain"
          draggable={false}
        />
      </button>
      {preview ? <ImagePreviewModal src={src} onClose={() => setPreview(false)} /> : null}
    </>
  );
}

/**
 * components:
 * - `a` 强制 `target=_blank rel=noopener`,沿用 .wk-markdown a 的样式
 * - `img` 复用 `<MarkdownImage>`:安全 URL 过滤 + lightbox 预览(issue #46 followup)
 * - `pre` 包一层 `.wk-markdown-pre-wrapper`(对齐旧仓 — wrapper 带 border/radius/overflow,
 *   pre 自身只负责 padding/overflow-x,避免 highlight.js dark 主题 bg 把 wrapper border 盖掉)
 * - 其他高频块级标签:有 tokens 时套 wrap 走 process 做 token 替换
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
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {tokens.length > 0 ? process(children) : children}
      </a>
    ),
    img: ({ src, alt }) => <MarkdownImage src={src as string | undefined} alt={alt} />,
    pre: ({ children, node: _node, ...rest }) => (
      <div className="wk-markdown-pre-wrapper">
        <pre {...rest}>{children}</pre>
      </div>
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

export function Markdown({
  content,
  tokens = [],
  className,
  isSend = false,
  isStreaming = false,
  enableMath = false,
}: MarkdownProps) {
  const normalized = useMemo(() => normalizeContent(content), [content]);
  const components = useMemo(() => buildComponents(tokens), [tokens]);

  const remarkPlugins = enableMath ? mathRemarkPlugins : baseRemarkPlugins;
  const rehypePlugins = enableMath ? mathRehypePlugins : baseRehypePlugins;

  const classes = ["wk-markdown", isSend ? "wk-markdown-send" : "wk-markdown-recv", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins as never}
        rehypePlugins={rehypePlugins as never}
        components={components}
      >
        {normalized}
      </ReactMarkdown>
      {isStreaming ? <span className="wk-stream-cursor" /> : null}
    </div>
  );
}
