import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

function renderMarkdown(content: string): string {
  return renderToStaticMarkup(<Markdown content={content} />);
}

describe("Markdown raw HTML", () => {
  it("renders pasted HTML source as text instead of executing the tag", () => {
    const html = renderMarkdown('<button class="x">Octo 登录</button>');

    expect(html).not.toContain("<button");
    expect(html).toContain("&lt;button class=&quot;x&quot;&gt;Octo 登录&lt;/button&gt;");
  });

  it("keeps empty HTML tags visible", () => {
    const html = renderMarkdown('<button class="x"></button>');

    expect(html).not.toContain("<button");
    expect(html).toContain("&lt;button class=&quot;x&quot;&gt;&lt;/button&gt;");
  });
});
