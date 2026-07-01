import { beforeEach, describe, expect, it, vi } from "vitest";

const channelManager = vi.hoisted(() => ({
  getChannelInfo: vi.fn(),
  setChannleInfoForCache: vi.fn(),
  notifyListeners: vi.fn(),
  fetchChannelInfo: vi.fn(),
}));

vi.mock("wukongimjssdk", () => {
  const ChannelTypePerson = 1;
  const ChannelTypeGroup = 2;
  class Channel {
    channelID: string;
    channelType: number;
    constructor(channelID: string, channelType: number) {
      this.channelID = channelID;
      this.channelType = channelType;
    }
  }
  class ChannelInfo {}
  const sdk = { shared: () => ({ channelManager }) };
  return {
    default: sdk,
    WKSDK: sdk,
    Channel,
    ChannelInfo,
    ChannelTypePerson,
    ChannelTypeGroup,
  };
});

import { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { buildThreadChannelId } from "../../base/im/parse-thread-channel-id";
import {
  GROUP_STATUS_DISBAND,
  GROUP_STATUS_NORMAL,
  isGroupDisbanded,
  isChannelDisbanded,
  isConversationDisbanded,
  shouldBlockDisbandedSend,
  syncGroupDisbandState,
} from "./group-disband";

const CHANNEL_TYPE_PERSON = 1;
const CHANNEL_TYPE_THREAD = 5;

function infoWithStatus(status?: number) {
  return { orgData: status === undefined ? {} : { status } } as never;
}

describe("group-disband helpers", () => {
  beforeEach(() => {
    channelManager.getChannelInfo.mockReset();
    channelManager.setChannleInfoForCache.mockReset();
    channelManager.notifyListeners.mockReset();
    channelManager.fetchChannelInfo.mockReset();
  });

  describe("isGroupDisbanded", () => {
    it("true only when status === Disband(2)", () => {
      expect(isGroupDisbanded(infoWithStatus(GROUP_STATUS_DISBAND))).toBe(true);
      expect(isGroupDisbanded(infoWithStatus(GROUP_STATUS_NORMAL))).toBe(false);
      expect(isGroupDisbanded(infoWithStatus(undefined))).toBe(false);
      expect(isGroupDisbanded(null)).toBe(false);
      expect(isGroupDisbanded(undefined)).toBe(false);
    });
  });

  describe("isChannelDisbanded", () => {
    it("true for disbanded group channel", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_DISBAND));
      const ch = new Channel("g1", ChannelTypeGroup);
      expect(isChannelDisbanded(ch)).toBe(true);
    });

    it("false for normal group / non-group / null", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_NORMAL));
      expect(isChannelDisbanded(new Channel("g1", ChannelTypeGroup))).toBe(false);
      // person channel: never disbanded, must not even query
      expect(isChannelDisbanded(new Channel("u1", CHANNEL_TYPE_PERSON))).toBe(false);
      expect(isChannelDisbanded(null)).toBe(false);
    });

    it("fail-open when cache misses (returns false, does not lock)", () => {
      channelManager.getChannelInfo.mockReturnValue(undefined);
      expect(isChannelDisbanded(new Channel("g1", ChannelTypeGroup))).toBe(false);
    });
  });

  describe("isConversationDisbanded", () => {
    it("group conversation follows its own status", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_DISBAND));
      expect(isConversationDisbanded(new Channel("g1", ChannelTypeGroup))).toBe(true);
    });

    it("topic(子区) conversation follows PARENT group status", () => {
      // getChannelInfo is called with the parent group channel; return disbanded
      channelManager.getChannelInfo.mockImplementation((ch: Channel) => {
        if (ch.channelID === "g1" && ch.channelType === ChannelTypeGroup) {
          return infoWithStatus(GROUP_STATUS_DISBAND);
        }
        return undefined;
      });
      const topicId = buildThreadChannelId("g1", "t99");
      const topic = new Channel(topicId, CHANNEL_TYPE_THREAD);
      expect(isConversationDisbanded(topic)).toBe(true);
      // confirm it resolved the parent group, not the topic channel
      const queried = channelManager.getChannelInfo.mock.calls.map(
        (c: unknown[]) => (c[0] as Channel).channelID,
      );
      expect(queried).toContain("g1");
    });

    it("topic with normal parent → not disbanded", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_NORMAL));
      const topic = new Channel(buildThreadChannelId("g1", "t99"), CHANNEL_TYPE_THREAD);
      expect(isConversationDisbanded(topic)).toBe(false);
    });

    it("unparseable topic id → fail-open false", () => {
      const topic = new Channel("no-separator", CHANNEL_TYPE_THREAD);
      expect(isConversationDisbanded(topic)).toBe(false);
    });

    it("null / person channel → false", () => {
      expect(isConversationDisbanded(null)).toBe(false);
      expect(isConversationDisbanded(new Channel("u1", CHANNEL_TYPE_PERSON))).toBe(false);
    });
  });

  describe("shouldBlockDisbandedSend (composer send-guard, plan §8)", () => {
    it("blocks send + fires onBlocked when the group conversation is disbanded", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_DISBAND));
      const onBlocked = vi.fn();
      const blocked = shouldBlockDisbandedSend(new Channel("g1", ChannelTypeGroup), onBlocked);
      expect(blocked).toBe(true);
      expect(onBlocked).toHaveBeenCalledTimes(1);
    });

    it("blocks send when a topic's PARENT group is disbanded", () => {
      channelManager.getChannelInfo.mockImplementation((ch: Channel) => {
        if (ch.channelID === "g1" && ch.channelType === ChannelTypeGroup) {
          return infoWithStatus(GROUP_STATUS_DISBAND);
        }
        return undefined;
      });
      const onBlocked = vi.fn();
      const topic = new Channel(buildThreadChannelId("g1", "t99"), CHANNEL_TYPE_THREAD);
      expect(shouldBlockDisbandedSend(topic, onBlocked)).toBe(true);
      expect(onBlocked).toHaveBeenCalledTimes(1);
    });

    it("allows send (returns false, no onBlocked) for a normal group", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_NORMAL));
      const onBlocked = vi.fn();
      expect(shouldBlockDisbandedSend(new Channel("g1", ChannelTypeGroup), onBlocked)).toBe(false);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it("allows send for null / person channels and when cache misses (fail-open)", () => {
      const onBlocked = vi.fn();
      expect(shouldBlockDisbandedSend(null, onBlocked)).toBe(false);
      expect(shouldBlockDisbandedSend(new Channel("u1", CHANNEL_TYPE_PERSON), onBlocked)).toBe(
        false,
      );
      channelManager.getChannelInfo.mockReturnValue(undefined);
      expect(shouldBlockDisbandedSend(new Channel("g1", ChannelTypeGroup), onBlocked)).toBe(false);
      expect(onBlocked).not.toHaveBeenCalled();
    });

    it("is safe without an onBlocked callback", () => {
      channelManager.getChannelInfo.mockReturnValue(infoWithStatus(GROUP_STATUS_DISBAND));
      expect(shouldBlockDisbandedSend(new Channel("g1", ChannelTypeGroup))).toBe(true);
    });
  });

  describe("syncGroupDisbandState", () => {
    it("group with live cache: writes status=Disband locally + notifies, no fetch (dodges dedup race)", () => {
      const info = infoWithStatus(GROUP_STATUS_NORMAL);
      channelManager.getChannelInfo.mockReturnValue(info);

      syncGroupDisbandState(new Channel("g1", ChannelTypeGroup));

      expect((info as { orgData: { status: number } }).orgData.status).toBe(GROUP_STATUS_DISBAND);
      expect(channelManager.setChannleInfoForCache).toHaveBeenCalledWith(info);
      expect(channelManager.notifyListeners).toHaveBeenCalledWith(info);
      // 关键:群有缓存时不走 fetchChannelInfo,避免在途旧请求覆盖回 Normal。
      expect(channelManager.fetchChannelInfo).not.toHaveBeenCalled();
    });

    it("group without live cache: falls back to fetchChannelInfo", () => {
      channelManager.getChannelInfo.mockReturnValue(undefined);

      syncGroupDisbandState(new Channel("g1", ChannelTypeGroup));

      expect(channelManager.fetchChannelInfo).toHaveBeenCalledTimes(1);
      expect(channelManager.setChannleInfoForCache).not.toHaveBeenCalled();
    });

    it("non-group channel (person/topic): falls through to fetchChannelInfo, no local write", () => {
      const person = new Channel("u1", CHANNEL_TYPE_PERSON);
      syncGroupDisbandState(person);
      expect(channelManager.fetchChannelInfo).toHaveBeenCalledWith(person);

      const topic = new Channel(buildThreadChannelId("g1", "t1"), CHANNEL_TYPE_THREAD);
      syncGroupDisbandState(topic);
      expect(channelManager.fetchChannelInfo).toHaveBeenCalledWith(topic);

      // 非群频道不做本地直写。
      expect(channelManager.setChannleInfoForCache).not.toHaveBeenCalled();
      expect(channelManager.notifyListeners).not.toHaveBeenCalled();
    });

    it("no channelID: no-op", () => {
      syncGroupDisbandState(new Channel("", ChannelTypeGroup));
      expect(channelManager.fetchChannelInfo).not.toHaveBeenCalled();
      expect(channelManager.setChannleInfoForCache).not.toHaveBeenCalled();
    });
  });
});
