import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, type CMDContent, ConversationAction, type Message } from "wukongimjssdk";
import { spaceStore } from "@/features/base/stores/space";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";

/**
 * 多端 unread 同步(对齐老仓 module.tsx:388 cmdListener `unreadClear` 分支)。
 *
 * 端 A 调 PUT /conversation/clearUnread 后,后端广播 CMDMessage `cmd: unreadClear`
 * 给所有其他在线端,端 B 在这里收到 → 本地把对应 conversation.unread 改为
 * param.unread(>0 时按服务端给的余量;<=0 时清零)+ notify listeners,
 * sidebar 列表 + 关注 tab 角标即时归零(issue #60)。
 *
 * **全局挂**:IMProvider 内 mount 一次,不依赖任何 channel 打开/会话列表 mount。
 * 老仓 module.tsx 在 register 阶段全局挂同款机制;新仓原本只在 use-messages-sync
 * 里挂 cmdListener 且绑当前 channel,导致 unreadClear 在没打开会话时漏接。
 *
 * **sidebar invalidate**:对齐端 A 自己 clear 时 useClearUnreadOnEnter 的行为
 * (服务端确认后 invalidate sidebar follow query),否则关注 tab 的角标走 sidebar
 * query 快照,不订阅 conversationListener,本地 conv.unread 更新它看不到。
 */
export function useUnreadClearSync() {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);

  useEffect(() => {
    const cmdListener = (cmdMessage: Message) => {
      const cmd = cmdMessage.content as CMDContent;
      if (cmd.cmd !== "unreadClear") return;
      const param = cmd.param as {
        channel_id?: string;
        channel_type?: number;
        unread?: number;
      };
      if (!param?.channel_id || param.channel_type == null) return;

      const channel = new Channel(param.channel_id, param.channel_type);
      const cm = WKSDK.shared().conversationManager;
      const conv = cm.findConversation(channel);
      if (conv) {
        const next = param.unread && param.unread > 0 ? param.unread : 0;
        if (conv.unread !== next) {
          conv.unread = next;
          cm.notifyConversationListeners(conv, ConversationAction.update);
        }
      }
      // 关注 tab sidebar 角标快照不订阅 conversationListener,得显式重 fetch
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
    };

    WKSDK.shared().chatManager.addCMDListener(cmdListener);
    return () => {
      WKSDK.shared().chatManager.removeCMDListener(cmdListener);
    };
  }, [qc, spaceId]);
}
