import { renderToStaticMarkup } from "react-dom/server";
import { Mention } from "wukongimjssdk";
import { describe, expect, it } from "vitest";
import { MentionAwareText } from "@/features/chat/lib/mention-aware-text";

function renderText(text: string, mention?: Mention): string {
  return renderToStaticMarkup(<MentionAwareText text={text} mention={mention} linkify />);
}

describe("MentionAwareText linkify", () => {
  it("renders safe rich-text links with highlight styling", () => {
    const html = renderText("文档 https://example.com/a?b=1。");

    expect(html).toContain('href="https://example.com/a?b=1"');
    expect(html).toContain("text-text-accent underline underline-offset-2");
    expect(html).toContain(">https://example.com/a?b=1</a>。");
  });

  it("normalizes www links to https hrefs", () => {
    const html = renderText("入口 www.example.com/path");

    expect(html).toContain('href="https://www.example.com/path"');
    expect(html).toContain(">www.example.com/path</a>");
  });

  it("does not consume mention uids for at-signs inside links", () => {
    const mention = new Mention();
    mention.uids = ["u1"];
    const html = renderText("https://example.com/@docs @张三", mention);

    expect(html).toContain(">https://example.com/@docs</a>");
    expect(html).toContain("<button");
    expect(html).toContain(">@张三</button>");
  });
});
