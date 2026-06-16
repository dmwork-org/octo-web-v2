import WKSDK, { Channel, ChannelTypeGroup, Subscriber } from "wukongimjssdk";
import { afterEach, describe, expect, it } from "vitest";
import { getSubscriberSyncVersion, sortSubscribersForSyncCursor } from "./im-callbacks";

function makeSubscriber(uid: string, role: number, version: number): Subscriber {
  const subscriber = new Subscriber();
  subscriber.uid = uid;
  subscriber.role = role;
  subscriber.version = version;
  return subscriber;
}

describe("sortSubscribersForSyncCursor", () => {
  it("keeps the highest version at the end for the SDK sync cursor", () => {
    const sorted = sortSubscribersForSyncCursor([
      makeSubscriber("owner", 1, 2),
      makeSubscriber("member", 0, 9),
      makeSubscriber("manager", 2, 5),
    ]);

    expect(sorted.map((subscriber) => subscriber.version)).toEqual([2, 5, 9]);
    expect(sorted[sorted.length - 1]?.version).toBe(9);
  });
});

describe("getSubscriberSyncVersion", () => {
  const channel = new Channel("group-1", ChannelTypeGroup);

  afterEach(() => {
    WKSDK.shared().channelManager.subscribeCacheMap.delete(channel.getChannelKey());
  });

  it("uses the cached max version when the SDK cursor points at a lower last item", () => {
    WKSDK.shared().channelManager.subscribeCacheMap.set(channel.getChannelKey(), [
      makeSubscriber("member-newer", 0, 9),
      makeSubscriber("member-older", 0, 3),
    ]);

    expect(getSubscriberSyncVersion(channel, 3)).toBe(9);
  });

  it("keeps the SDK cursor when cache is empty", () => {
    expect(getSubscriberSyncVersion(channel, 7)).toBe(7);
  });
});
