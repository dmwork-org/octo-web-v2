import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, Message } from "wukongimjssdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildThreadChannelId } from "../../base/im/parse-thread-channel-id";
import { spaceActions } from "../../base/stores/space";
import { senderDisplay, senderExternalSpaceName } from "./message-sender-display";

type MessageWithExternalFields = Message & {
  from_home_space_id?: string;
  from_home_space_name?: string;
  from_is_external?: number;
  from_source_space_name?: string;
};

function makeMessage(channel: Channel, fromUID = "user-1"): Message {
  const message = new Message();
  message.channel = channel;
  message.fromUID = fromUID;
  return message;
}

afterEach(() => {
  vi.restoreAllMocks();
  spaceActions.setSpace(null);
});

describe("senderDisplay", () => {
  it("prefers group subscriber remark for message sender display", () => {
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      { uid: "user-1", remark: "群昵称", name: "原名" },
    ] as never);

    expect(senderDisplay(makeMessage(new Channel("group-1", ChannelTypeGroup)))).toBe("群昵称");
  });

  it("falls back to group subscriber name when remark is empty", () => {
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      { uid: "user-1", remark: "", name: "群内姓名" },
    ] as never);

    expect(senderDisplay(makeMessage(new Channel("group-1", ChannelTypeGroup)))).toBe("群内姓名");
  });

  it("uses parent group subscribers for thread messages", () => {
    const getSubscribes = vi
      .spyOn(WKSDK.shared().channelManager, "getSubscribes")
      .mockReturnValue([{ uid: "user-1", remark: "子区群昵称", name: "原名" }] as never);
    const threadChannel = new Channel(buildThreadChannelId("group-1", "thread-1"), 5);

    expect(senderDisplay(makeMessage(threadChannel))).toBe("子区群昵称");
    expect(getSubscribes.mock.calls[0]?.[0].channelID).toBe("group-1");
    expect(getSubscribes.mock.calls[0]?.[0].channelType).toBe(ChannelTypeGroup);
  });

  it("falls back to person channel title outside group context", () => {
    vi.spyOn(WKSDK.shared().channelManager, "getChannelInfo").mockReturnValue({
      title: "全局姓名",
    } as never);

    expect(senderDisplay(makeMessage(new Channel("user-2", ChannelTypePerson)))).toBe("全局姓名");
  });

  it("resolves legacy external source space separately from group sender display", () => {
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      { uid: "user-1", remark: "", name: "Nancy" },
    ] as never);
    const message = makeMessage(
      new Channel("group-1", ChannelTypeGroup),
    ) as MessageWithExternalFields;
    message.from_is_external = 1;
    message.from_source_space_name = "建文测试";

    expect(senderDisplay(message)).toBe("Nancy");
    expect(senderExternalSpaceName(message)).toBe("建文测试");
  });

  it("uses home space fields relative to current space", () => {
    spaceActions.setSpace("space-a");
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      { uid: "user-1", remark: "", name: "Nancy" },
    ] as never);
    const message = makeMessage(
      new Channel("group-1", ChannelTypeGroup),
    ) as MessageWithExternalFields;
    message.from_home_space_id = "space-b";
    message.from_home_space_name = "建文测试";

    expect(senderDisplay(message)).toBe("Nancy");
    expect(senderExternalSpaceName(message)).toBe("建文测试");
  });

  it("does not append home space when sender belongs to current space", () => {
    spaceActions.setSpace("space-a");
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      { uid: "user-1", remark: "", name: "Nancy" },
    ] as never);
    const message = makeMessage(
      new Channel("group-1", ChannelTypeGroup),
    ) as MessageWithExternalFields;
    message.from_home_space_id = "space-a";
    message.from_home_space_name = "当前空间";

    expect(senderDisplay(message)).toBe("Nancy");
    expect(senderExternalSpaceName(message)).toBe("");
  });
});
