import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CitationText } from "./citation-text";

describe("CitationText team citations", () => {
  it("renders team participant references as clickable P badges", () => {
    const html = renderToStaticMarkup(
      <CitationText
        content="团队汇总来自 [P1] 和 [P2]"
        citations={[]}
        teamCitations={[
          { index: 1, user_id: "u1", user_name: "张三" },
          { index: 2, user_id: "u2", user_name: "李四" },
        ]}
        members={[{ user_id: "u1", user_name: "张三", status: "submitted", submitted_at: "now" }]}
      />,
    );

    expect(html).toContain("[P1]");
    expect(html).toContain("[P2]");
    expect(html).toContain("<button");
  });

  it("keeps plain message citations as text when privacy mode is enabled", () => {
    const html = renderToStaticMarkup(
      <CitationText
        content="个人报告 [1]"
        citations={[
          {
            index: 1,
            sender: "张三",
            content: "secret",
            sent_at: "2026-06-27T00:00:00Z",
            source: "群聊",
          },
        ]}
        hidePlainCitations
      />,
    );

    expect(html).toContain("[1]");
    expect(html).not.toContain("secret");
  });
});
