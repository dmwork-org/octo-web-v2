import { describe, expect, it } from "vitest";
import {
  buildChannelSearchSnippetTokens,
  parseChannelSearchSnippetHighlights,
  tokenizeChannelSearchSnippet,
} from "./channel-search-snippet";

describe("channel search snippet tokenization", () => {
  it("converts backend mark tags into highlight ranges without preserving html", () => {
    const parsed = parseChannelSearchSnippetHighlights("你好<mark>搜索</mark><b>结果</b>", "nope");

    expect(parsed).toEqual({
      text: "你好搜索<b>结果</b>",
      ranges: [{ start: 2, end: 4 }],
    });
  });

  it("renders a whole custom emoji when backend mark splits the emoji key", () => {
    const parsed = parseChannelSearchSnippetHighlights("这个[有<mark>品</mark>位]不错", "品");
    const tokens = buildChannelSearchSnippetTokens(parsed.text, parsed.ranges);

    expect(tokens).toEqual([
      { type: "text", text: "这个", highlighted: false },
      {
        type: "emoji",
        key: "[有品位]",
        url: "/emoji/custom_taste.png",
        highlighted: true,
      },
      { type: "text", text: "不错", highlighted: false },
    ]);
  });

  it("highlights a custom emoji when keyword matches inside the emoji key", () => {
    const tokens = tokenizeChannelSearchSnippet("这个[有品位]不错", "品");

    expect(tokens[1]).toMatchObject({
      type: "emoji",
      key: "[有品位]",
      highlighted: true,
    });
  });

  it("keeps unrelated html as text and only converts known emoji tokens", () => {
    const tokens = tokenizeChannelSearchSnippet('hello <img src="x"> [有品位]', "hello");

    expect(tokens).toEqual([
      { type: "text", text: "hello", highlighted: true },
      { type: "text", text: ' <img src="x"> ', highlighted: false },
      {
        type: "emoji",
        key: "[有品位]",
        url: "/emoji/custom_taste.png",
        highlighted: false,
      },
    ]);
  });
});
