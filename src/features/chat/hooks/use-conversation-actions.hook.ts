import { useMutation, useQueryClient } from "@tanstack/react-query";
import WKSDK, { ChannelTypeGroup, ChannelTypePerson, type Conversation } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import {
  clearChannelMessages,
  clearConversationUnread,
} from "@/features/base/api/endpoints/conversation.api";
import { setChannelMute } from "@/features/base/api/endpoints/channel-setting.api";
import {
  unfollowChannel,
  unfollowDM,
  unfollowThread,
} from "@/features/base/api/endpoints/follow.api";
import { t } from "@/lib/i18n/instance";

const CHANNEL_TYPE_THREAD = 5;

type ConversationActionScope = "convList" | "followList";

interface UseConversationActionsOptions {
  scope: ConversationActionScope;
  onClearUnreadSuccess?: (conv: Conversation) => void;
  onClearMessagesSuccess?: (conv: Conversation) => void;
  onMuteSuccess?: (args: { conv: Conversation; mute: boolean }) => void;
  onUnfollowSuccess?: (conv: Conversation) => void;
}

function errorText(err: unknown, fallbackKey: string): string {
  return err instanceof Error ? err.message : t(fallbackKey);
}

function unsupportedTypeError(scope: ConversationActionScope): Error {
  return new Error(t(`${scope}.error.unsupportedType`));
}

export function useConversationActions({
  scope,
  onClearUnreadSuccess,
  onClearMessagesSuccess,
  onMuteSuccess,
  onUnfollowSuccess,
}: UseConversationActionsOptions) {
  const qc = useQueryClient();

  const clearUnreadMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearConversationUnread({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
      }),
    onSuccess: (_void, conv) => {
      conv.unread = 0;
      onClearUnreadSuccess?.(conv);
    },
    onError: (err) => toast.error(errorText(err, `${scope}.toast.markReadFailed`)),
  });

  const muteMu = useMutation({
    mutationFn: (args: { conv: Conversation; mute: boolean }) =>
      setChannelMute(args.conv.channel, args.mute),
    onSuccess: (_void, args) => {
      if (onMuteSuccess) {
        onMuteSuccess(args);
      } else {
        void WKSDK.shared().channelManager.fetchChannelInfo(args.conv.channel);
      }
      toast.success(args.mute ? t(`${scope}.toast.muted`) : t(`${scope}.toast.unmuted`));
    },
    onError: (err) => toast.error(errorText(err, `${scope}.toast.opFailed`)),
  });

  const clearMessagesMu = useMutation({
    mutationFn: (conv: Conversation) =>
      clearChannelMessages({
        channelId: conv.channel.channelID,
        channelType: conv.channel.channelType,
        messageSeq: conv.lastMessage?.messageSeq ?? 0,
      }),
    onSuccess: (_void, conv) => {
      qc.setQueryData(["chat", "messages", conv.channel.channelType, conv.channel.channelID], {
        pages: [[]],
        pageParams: [0],
      });
      toast.success(t(`${scope}.toast.cleared`));
      onClearMessagesSuccess?.(conv);
    },
    onError: (err) => toast.error(errorText(err, `${scope}.toast.clearFailed`)),
  });

  const unfollowMu = useMutation({
    mutationFn: (conv: Conversation) => {
      const tp = conv.channel.channelType;
      if (tp === ChannelTypeGroup) return unfollowChannel(conv.channel.channelID);
      if (tp === ChannelTypePerson) return unfollowDM(conv.channel.channelID);
      if (tp === CHANNEL_TYPE_THREAD) return unfollowThread(conv.channel.channelID);
      return Promise.reject(unsupportedTypeError(scope));
    },
    onSuccess: (_void, conv) => {
      onUnfollowSuccess?.(conv);
      toast.success(t(`${scope}.toast.unfollowed`));
    },
    onError: (err) => toast.error(errorText(err, `${scope}.toast.unfollowFailed`)),
  });

  return {
    clearUnreadMu,
    muteMu,
    clearMessagesMu,
    unfollowMu,
  };
}
