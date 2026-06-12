import { describe, expect, it } from "vitest";
import { quotedReplyPreviewText } from "./quoted-reply-preview";

describe("quotedReplyPreviewText", () => {
  it("does not duplicate media placeholders when digest already matches the type hint", () => {
    expect(quotedReplyPreviewText("[图片]", "[图片]")).toBe("[图片]");
  });

  it("keeps a type hint for attachment digests with extra detail", () => {
    expect(quotedReplyPreviewText("[文件]", "report.pdf")).toBe("[文件] report.pdf");
  });

  it("falls back to plain digest for text messages", () => {
    expect(quotedReplyPreviewText("", "hello")).toBe("hello");
  });
});
