import { afterEach, describe, expect, it, vi } from "vitest";
import { Channel, ChannelTypeGroup, ChannelTypePerson, Conversation } from "wukongimjssdk";
import { rawToConversation } from "../im/convert";
import { channelSpaceKey, channelSpaceMap } from "../stores/space";
import { isConversationOfSpace } from "./space-filter";

vi.mock("@/features/chat/lib/live-channel-title", () => ({
  tryFetchChannelInfo: vi.fn(),
}));

const CHANNEL_TYPE_THREAD = 5;

function makeConversation(channelId: string, channelType: number, spaceId?: string): Conversation {
  const conv = new Conversation();
  conv.channel = new Channel(channelId, channelType);
  conv.extra = spaceId ? { spaceId } : undefined;
  return conv;
}

describe("isConversationOfSpace", () => {
  afterEach(() => {
    channelSpaceMap.clear();
  });

  it("uses conversation spaceId for thread conversations before parent group info is cached", () => {
    const conv = rawToConversation({
      channel_id: "group-1____thread-1",
      channel_type: CHANNEL_TYPE_THREAD,
      space_id: "space-a",
      unread: 3,
    });

    expect(isConversationOfSpace(conv, "space-a")).toBe(true);
    expect(isConversationOfSpace(conv, "space-b")).toBe(false);
  });

  it("keeps person conversations compatible when no message space id exists", () => {
    const conv = makeConversation("user-1", ChannelTypePerson);

    expect(isConversationOfSpace(conv, "space-a")).toBe(true);
  });

  it("still falls back to channel ownership for group conversations without a spaceId", () => {
    channelSpaceMap.set(channelSpaceKey("group-1", ChannelTypeGroup), "space-a");
    const conv = makeConversation("group-1", ChannelTypeGroup);

    expect(isConversationOfSpace(conv, "space-a")).toBe(true);
    expect(isConversationOfSpace(conv, "space-b")).toBe(false);
  });
});
