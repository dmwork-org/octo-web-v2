import { describe, expect, it } from "vitest";
import { MessageContentTypeConst } from "../../base/im/content-types";
import {
  isCacheableChatMessage,
  isSameMessageIdentity,
  messageRenderKey,
} from "./message-identity";

describe("message identity", () => {
  it("keeps ui-only marker messages out of the chat message cache", () => {
    expect(isCacheableChatMessage({ contentType: MessageContentTypeConst.historySplit })).toBe(
      false,
    );
    expect(isCacheableChatMessage({ contentType: MessageContentTypeConst.time })).toBe(false);
    expect(isCacheableChatMessage({ contentType: MessageContentTypeConst.typing })).toBe(false);
    expect(isCacheableChatMessage({ contentType: MessageContentTypeConst.text })).toBe(true);
  });

  it("does not treat empty clientMsgNo values as the same message", () => {
    expect(
      isSameMessageIdentity(
        { clientMsgNo: "", messageID: "", messageSeq: 0 },
        { clientMsgNo: "", messageID: "", messageSeq: 0 },
      ),
    ).toBe(false);
  });

  it("matches messages by non-empty clientMsgNo, messageID, or positive messageSeq", () => {
    expect(isSameMessageIdentity({ clientMsgNo: "c1" }, { clientMsgNo: "c1" })).toBe(true);
    expect(isSameMessageIdentity({ messageID: "m1" }, { messageID: "m1" })).toBe(true);
    expect(isSameMessageIdentity({ messageSeq: 42 }, { messageSeq: 42 })).toBe(true);
  });

  it("always returns a non-empty render key for marker-like messages", () => {
    expect(
      messageRenderKey(
        {
          clientMsgNo: "",
          messageID: "",
          messageSeq: 0,
          contentType: MessageContentTypeConst.historySplit,
          timestamp: 123,
        },
        2,
      ),
    ).toBe("fallback:-3:unknown:123:0:2");
  });
});
