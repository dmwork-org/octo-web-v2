import WKSDK, { Channel, ChannelTypeGroup, type Message, type Subscriber } from "wukongimjssdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectRevokeRoleContext,
  warmMissingRevokeTargetRole,
} from "./use-ensure-role-subscribers.hook";

function makeMessage(fromUID = "target"): Message {
  return {
    channel: new Channel("group-1", ChannelTypeGroup),
    fromUID,
    send: false,
  } as Message;
}

function makeSubscriber(uid: string, role: number): Subscriber {
  return { uid, role } as Subscriber;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectRevokeRoleContext", () => {
  it("does not trigger membersync while collecting role context during render", () => {
    const channelManager = WKSDK.shared().channelManager;
    vi.spyOn(channelManager, "getSubscribes").mockReturnValue([makeSubscriber("me", 2)] as never);
    const syncSpy = vi.spyOn(channelManager, "syncSubscribes").mockResolvedValue(undefined);

    const context = collectRevokeRoleContext(makeMessage(), "me");

    expect(context.myRole).toBe(2);
    expect(context.targetRole).toBeUndefined();
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe("warmMissingRevokeTargetRole", () => {
  it("dedupes pending membersync requests for the same role channel", async () => {
    const channelManager = WKSDK.shared().channelManager;
    vi.spyOn(channelManager, "getSubscribes").mockReturnValue([makeSubscriber("me", 2)] as never);
    let resolveSync: () => void = () => {};
    const syncPromise = new Promise<void>((resolve) => {
      resolveSync = resolve;
    });
    const syncSpy = vi.spyOn(channelManager, "syncSubscribes").mockReturnValue(syncPromise);

    warmMissingRevokeTargetRole(makeMessage(), "me");
    warmMissingRevokeTargetRole(makeMessage("target-2"), "me");

    expect(syncSpy).toHaveBeenCalledTimes(1);
    resolveSync();
    await syncPromise;
  });
});
