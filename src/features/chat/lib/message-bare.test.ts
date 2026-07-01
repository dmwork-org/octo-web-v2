import { describe, expect, it } from "vitest";
import { MessageContentTypeConst } from "../../base/im/content-types";
import { shouldRenderBareContentType } from "./message-bare";

describe("shouldRenderBareContentType", () => {
  it("renders screenshot notifications as bare system pills", () => {
    expect(shouldRenderBareContentType(MessageContentTypeConst.screenshot)).toBe(true);
  });

  it("renders ui-only marker messages as bare rows if they reach the renderer", () => {
    expect(shouldRenderBareContentType(MessageContentTypeConst.historySplit)).toBe(true);
    expect(shouldRenderBareContentType(MessageContentTypeConst.time)).toBe(true);
  });

  it("keeps thread-created messages in the full message row", () => {
    expect(shouldRenderBareContentType(MessageContentTypeConst.threadCreated)).toBe(false);
  });
});
