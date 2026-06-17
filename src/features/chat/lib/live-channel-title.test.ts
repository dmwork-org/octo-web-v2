import WKSDK, { Channel, ChannelInfo } from "wukongimjssdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearFetchedTitleCache, getLiveTitle } from "./live-channel-title";

const CHANNEL_TYPE_THREAD = 5;

describe("getLiveTitle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearFetchedTitleCache();
  });

  it("fetches missing channel info once while reporting loading", () => {
    const channel = new Channel("group-1____thread-1", CHANNEL_TYPE_THREAD);
    const manager = WKSDK.shared().channelManager;
    const fetchSpy = vi.spyOn(manager, "fetchChannelInfo").mockResolvedValue(undefined);
    vi.spyOn(manager, "getChannelInfo").mockReturnValue(undefined);

    expect(getLiveTitle(channel)).toEqual({ title: "", loading: true });
    expect(getLiveTitle(channel)).toEqual({ title: "", loading: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses cached display name before raw title", () => {
    const channel = new Channel("group-1____thread-1", CHANNEL_TYPE_THREAD);
    const info = new ChannelInfo();
    info.channel = channel;
    info.title = "Raw Thread Name";
    info.orgData = { displayName: "Display Thread Name" };
    vi.spyOn(WKSDK.shared().channelManager, "getChannelInfo").mockReturnValue(info);

    expect(getLiveTitle(channel)).toEqual({
      title: "Display Thread Name",
      loading: false,
    });
  });
});
