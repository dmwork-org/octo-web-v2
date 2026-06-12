import { useStore } from "@tanstack/react-store";
import WKSDK, { type Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk";
import { endpointStore } from "@/features/base/stores/endpoint";
import { avatarVersionFor, avatarVersionStore } from "@/features/base/stores/avatar-version";
import { spaceStore } from "@/features/base/stores/space";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";

function withVersion(url: string, version: number): string {
  if (!url || version <= 0 || url.startsWith("data:")) return url;
  const parsed = new URL(url, window.location.origin);
  if (!parsed.searchParams.get("v")) {
    parsed.searchParams.set("v", String(version));
  }
  if (url.startsWith("/")) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return parsed.toString();
}

function personFallbackUrl(baseURL: string, channelID: string, spaceId: string | null): string {
  if (!baseURL || !channelID) return "";
  let uid = channelID;
  if (spaceId && uid.startsWith(`s${spaceId}_`)) {
    uid = uid.substring(spaceId.length + 2);
  }
  if (!uid) uid = channelID;
  return `${baseURL}/users/${uid}/avatar`;
}

function groupFallbackUrl(baseURL: string, channelID: string): string {
  if (!baseURL || !channelID) return "";
  return `${baseURL}/groups/${channelID}/avatar`;
}

function channelAvatarRawUrl(
  channel: Channel,
  baseURL: string,
  spaceId: string | null,
  logo: string | undefined,
): string {
  if (logo) {
    return logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")
      ? logo
      : `${baseURL}/${logo.replace(/^\/+/, "")}`;
  }
  if (channel.channelType === ChannelTypePerson) {
    return personFallbackUrl(baseURL, channel.channelID, spaceId);
  }
  if (channel.channelType === ChannelTypeGroup) {
    return groupFallbackUrl(baseURL, channel.channelID);
  }
  return "";
}

export function useChannelAvatarUrl(channel: Channel | null): string {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const avatarVersion = useStore(avatarVersionStore, (s) => {
    if (!channel) return 0;
    if (channel.channelType === ChannelTypePerson || channel.channelType === ChannelTypeGroup) {
      return (
        s.versions[channel.channelID] ?? avatarVersionFor(channel.channelID, channel.channelType)
      );
    }
    return 0;
  });
  useChannelInfoTick();
  if (!channel) return "";
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  return withVersion(
    channelAvatarRawUrl(channel, baseURL, spaceId, channelInfo?.logo),
    avatarVersion,
  );
}
