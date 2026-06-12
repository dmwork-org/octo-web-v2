import { ChannelInfo, type Conversation } from "wukongimjssdk";
import { describe, expect, it } from "vitest";
import { isConversationTop } from "./conversation-top";

function conversationTopFixture({
  channelInfoTop,
  extraTop,
}: {
  channelInfoTop?: boolean;
  extraTop?: number;
}): Pick<Conversation, "channelInfo" | "extra"> {
  const channelInfo = new ChannelInfo();
  channelInfo.top = channelInfoTop ?? false;
  return {
    channelInfo: channelInfoTop === undefined ? undefined : channelInfo,
    extra: extraTop === undefined ? undefined : { top: extraTop },
  } as Pick<Conversation, "channelInfo" | "extra">;
}

describe("isConversationTop", () => {
  it("uses channelInfo.top when channel info has been refreshed", () => {
    expect(isConversationTop(conversationTopFixture({ channelInfoTop: true, extraTop: 0 }))).toBe(
      true,
    );
    expect(isConversationTop(conversationTopFixture({ channelInfoTop: false, extraTop: 1 }))).toBe(
      false,
    );
  });

  it("falls back to conversation extra from the initial sync", () => {
    expect(isConversationTop(conversationTopFixture({ extraTop: 1 }))).toBe(true);
    expect(isConversationTop(conversationTopFixture({ extraTop: 0 }))).toBe(false);
  });
});
