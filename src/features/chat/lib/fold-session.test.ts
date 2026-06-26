import WKSDK, { Channel, ChannelTypeGroup, Message, MessageContent } from "wukongimjssdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageContentTypeConst } from "../../base/im/content-types";
import { buildRenderItems } from "./fold-session";

function makeMessage(seq: number, contentType: number): Message {
  const message = new Message();
  message.channel = new Channel("group-1", ChannelTypeGroup);
  message.clientMsgNo = `client-${seq}`;
  message.messageID = String(seq);
  message.messageSeq = seq;
  message.fromUID = "bot-1";
  message.timestamp = 1_000 + seq;
  const content = new MessageContent();
  content.contentType = contentType;
  message.content = content;
  return message;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildRenderItems", () => {
  it("keeps bot file attachments visible instead of folding them into sessions", () => {
    vi.spyOn(WKSDK.shared().channelManager, "getChannelInfo").mockReturnValue({
      title: "Bot",
      orgData: { robot: 1 },
    } as never);

    const items = buildRenderItems([
      makeMessage(1, MessageContentTypeConst.text),
      makeMessage(2, MessageContentTypeConst.text),
      makeMessage(3, MessageContentTypeConst.file),
      makeMessage(4, MessageContentTypeConst.text),
      makeMessage(5, MessageContentTypeConst.text),
    ]);

    expect(items.map((item) => item.type)).toEqual(["foldSession", "message", "foldSession"]);
    expect(items[1]?.type === "message" ? items[1].message.contentType : null).toBe(
      MessageContentTypeConst.file,
    );
  });
});
