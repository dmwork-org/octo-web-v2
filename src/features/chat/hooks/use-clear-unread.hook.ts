import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Channel, type Conversation, ConversationAction } from "wukongimjssdk";
import { clearConversationUnread } from "@/features/base/api/endpoints/conversation.api";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { spaceStore } from "@/features/base/stores/space";

/**
 * 进入会话视图时清空未读 + 标记 reminders 已完成(对应旧 Conversation/vm.ts
 * 进入会话时 markConversationUnread + markReminderDones)。
 *
 * - **unread**:调 PUT /v1/conversation/clearUnread,本地立即把 SDK Conversation.unread
 *   置 0 并 notify(会话列表 badge 即时消失);服务端确认后 invalidate sidebarFollow
 *   query → 关注 tab sidebar-only 条目角标也归零(对齐上游 72a8adc3 / #203)
 * - **reminders**(对齐老仓 vm.ts:1090 markReminderDones,本仓原本漏搬):服务端
 *   推送的 @我 / 入群申请等 reminder 在 conv.reminders 数组里,进入会话即视为
 *   已读,调 `reminderManager.done(ids)` 标 done(本地 + 上报 server)。否则
 *   `isMentionMe` 永远命中 reminders 分支,sidebar [@我] 角标永久残留 ——
 *   即使你没真被 @ 也会显示("发一个 @ 别人都收到 @我"的真凶)
 * - channel 切换时重新调
 *
 * **持续监听 listener 模式**(对齐老仓 Conversation/vm.ts conversationListener):
 * mount 时若 conv 还不存在(如新建群,SDK 还没 push add)直接 return 就漏了 —
 * 后端 push add 带 unread=1(系统"群创建成功"消息)时本地不会再清,徽标卡住。
 * 改为:mount 时试一次 + 注册 conversationListener,SDK 任何 push 命中当前 channel
 * 都重试 ack。
 *
 * 失败静默(已读上报不阻塞用户操作)。
 */
export function useClearUnreadOnEnter(channel: Channel | null) {
  const qc = useQueryClient();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  useEffect(() => {
    if (!channel) return;

    const ack = () => {
      const conv = WKSDK.shared().conversationManager.findConversation(channel);
      if (!conv) return;

      // ─── unread ──────────────────────────────────────────────────────
      if (conv.unread > 0) {
        const prevUnread = conv.unread;
        conv.unread = 0;
        WKSDK.shared().conversationManager.notifyConversationListeners(
          conv,
          ConversationAction.update,
        );

        void clearConversationUnread({
          channelId: channel.channelID,
          channelType: channel.channelType,
          unread: 0,
        })
          .then(() => {
            // 服务端确认未读已清 → 触发 sidebar 重新 fetch,让关注 tab sidebar-only
            // 条目的角标快照也归零(对齐上游 72a8adc3 / #203)。
            void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
          })
          .catch(() => {
            // 失败回滚 unread(下次 syncConversations 会自我修正,无需手动)
            conv.unread = prevUnread;
            WKSDK.shared().conversationManager.notifyConversationListeners(
              conv,
              ConversationAction.update,
            );
          });
      }

      // ─── reminders done ──────────────────────────────────────────────
      // 对齐老仓 vm.ts:1090 markReminderDones:进入会话即标记所有未 done 的
      // reminder 为 done(本地 + 上报 server)。否则 isMentionMe 永远命中
      // reminders 分支,[@我] 角标永久残留。
      if (conv.reminders && conv.reminders.length > 0) {
        const undoneIds: number[] = [];
        for (const r of conv.reminders) {
          if (!r.done) undoneIds.push(r.reminderID);
        }
        if (undoneIds.length > 0) {
          // reminderManager.done() 内部:1) 本地 reminder.done = true 2) 调
          // provider.reminderDoneCallback 上报 server。返回 promise,失败静默
          // (下次 syncReminders 拿到 done=1 仍会修正)。
          void WKSDK.shared().reminderManager.done(undoneIds);
          // 立刻触发一次 conversationListeners,让 isMentionMe 派生的 [@我]
          // 角标本帧消失(reminderManager.done 本地改 reminder.done 不会主动
          // notify conversation 监听者)。
          WKSDK.shared().conversationManager.notifyConversationListeners(
            conv,
            ConversationAction.update,
          );
        }
      }
    };

    // mount 时立即试一次(已存在 conv 走这条)
    ack();

    // 持续监听:SDK push add / update 命中当前 channel 时再 ack(新建群场景靠这条)
    const cm = WKSDK.shared().conversationManager;
    const listener = (c: Conversation, _action: ConversationAction) => {
      if (c.channel.isEqual(channel)) ack();
    };
    cm.addConversationListener(listener);
    return () => cm.removeConversationListener(listener);
  }, [channel, qc, spaceId]);
}
