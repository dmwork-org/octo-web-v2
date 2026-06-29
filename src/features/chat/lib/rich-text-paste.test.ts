import { describe, expect, it } from "vitest";
import { MENTION_UID_HUMANS, MENTION_UID_RENDER_ALL } from "../../base/lib/mention-three-state";
import { buildInlineContentForRichTextPaste } from "./rich-text-paste";

describe("buildInlineContentForRichTextPaste", () => {
  it("restores a mention only when uid and label match a current member", () => {
    const content = buildInlineContentForRichTextPaste(
      "hi @Alice",
      [{ uid: "u1", offset: 3, length: 6 }],
      [{ uid: "u1", name: "Alice" }],
    );

    expect(content).toEqual([
      { type: "text", text: "hi " },
      { type: "mention", attrs: { id: "u1", label: "Alice" } },
    ]);
  });

  it("degrades unknown or mismatched pasted mentions to plain text", () => {
    const content = buildInlineContentForRichTextPaste(
      "hi @Alice",
      [{ uid: "u2", offset: 3, length: 6 }],
      [{ uid: "u1", name: "Alice" }],
    );

    expect(content).toEqual([
      { type: "text", text: "hi " },
      { type: "text", text: "@Alice" },
    ]);
  });

  it("never restores broadcast sentinel uids from clipboard metadata", () => {
    const humans = buildInlineContentForRichTextPaste(
      "@所有人",
      [{ uid: MENTION_UID_HUMANS, offset: 0, length: 4 }],
      [{ uid: MENTION_UID_HUMANS, name: "所有人" }],
    );
    const renderAll = buildInlineContentForRichTextPaste(
      "@所有人",
      [{ uid: MENTION_UID_RENDER_ALL, offset: 0, length: 4 }],
      [{ uid: MENTION_UID_RENDER_ALL, name: "所有人" }],
    );

    expect(humans).toEqual([{ type: "text", text: "@所有人" }]);
    expect(renderAll).toEqual([{ type: "text", text: "@所有人" }]);
  });
});
