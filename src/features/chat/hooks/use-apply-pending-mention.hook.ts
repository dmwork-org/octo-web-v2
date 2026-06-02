import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { useStore } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import {
  chatMentionRequestActions,
  chatMentionRequestStore,
  selectPendingMention,
} from "@/features/chat/stores/chat-mention-request";

/**
 * Composer hook — 监听 chatMentionRequestStore.pending(by channel),
 * 检测到新请求(头像菜单点 "@TA")时把 tiptap mention node 插到 editor 当前光标位置,
 * 然后消费 store(清掉 pending,避免重复插入)。
 *
 * - mention node attrs:{ id: uid, label: name } — 跟 mention picker 选项产出格式一致
 * - 末尾追加 1 个空格,UX 同输入法选词
 * - 命名 hook 满足项目规则 `no-useeffect-in-component`(component 本体不能裸 useEffect)
 *
 * **稳定性**:store 用单调递增 nonce 区分多次同 uid 请求,deps 含 pending 引用变化触发。
 */
export function useApplyPendingMention(channel: Channel, editor: Editor | null): void {
  const pending = useStore(chatMentionRequestStore, (s) => selectPendingMention(s, channel));

  useEffect(() => {
    if (!pending || !editor) return;
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "mention", attrs: { id: pending.uid, label: pending.label } },
        { type: "text", text: " " },
      ])
      .run();
    chatMentionRequestActions.consume(channel);
  }, [pending, editor, channel]);
}
