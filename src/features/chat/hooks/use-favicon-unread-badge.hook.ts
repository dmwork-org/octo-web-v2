import { useEffect } from "react";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Conversation } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { isConversationOfSpace } from "@/features/base/lib/space-filter";
import { setFaviconUnreadBadge } from "@/features/base/lib/favicon-badge";
import { effectiveMute } from "@/features/chat/lib/conversation-last-content";

function hasVisibleUnread(conversations: Conversation[], spaceId: string | null): boolean {
  return conversations.some(
    (conversation) =>
      conversation.unread > 0 &&
      isConversationOfSpace(conversation, spaceId) &&
      !effectiveMute(conversation),
  );
}

/**
 * Browser tab favicon badge.
 *
 * 口径跟「最近」tab 未读一致:当前 Space 内 unread > 0 且未免打扰的会话,
 * 在原 favicon 右下角叠红点;清未读 / 切 Space / mute 变化时自动恢复。
 */
export function useFaviconUnreadBadge(uid: string | null) {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    if (!uid) {
      setFaviconUnreadBadge(false);
      return;
    }

    const sdk = WKSDK.shared();
    let disposed = false;

    const refresh = () => {
      if (disposed) return;
      setFaviconUnreadBadge(hasVisibleUnread(sdk.conversationManager.conversations ?? [], spaceId));
    };

    refresh();

    void sdk.conversationManager.sync({}).then(refresh).catch(refresh);

    sdk.conversationManager.addConversationListener(refresh);
    sdk.channelManager.addListener(refresh);

    return () => {
      disposed = true;
      sdk.conversationManager.removeConversationListener(refresh);
      sdk.channelManager.removeListener(refresh);
      setFaviconUnreadBadge(false);
    };
  }, [uid, spaceId]);
}
