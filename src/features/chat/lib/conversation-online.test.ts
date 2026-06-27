import { describe, expect, it } from "vitest";
import { shouldShowConversationOnline } from "./conversation-online";

describe("shouldShowConversationOnline", () => {
  it("shows online channels", () => {
    expect(shouldShowConversationOnline({ online: true, lastOffline: 0 })).toBe(true);
  });

  it("shows recently offline channels for one hour", () => {
    const now = Date.now() / 1000;
    expect(shouldShowConversationOnline({ online: false, lastOffline: now - 30 * 60 })).toBe(true);
    expect(shouldShowConversationOnline({ online: false, lastOffline: now - 61 * 60 })).toBe(false);
  });
});
