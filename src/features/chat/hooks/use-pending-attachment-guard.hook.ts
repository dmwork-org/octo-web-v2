import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { chatPendingAttachmentRegistry } from "@/features/chat/stores/chat-pending-attachment";

/**
 * Composer 把"是否有未发送附件"注册到全局守卫表 — 切 channel 前 select() 内
 * 调 `hasPending()` 决定是否弹 confirm dialog(1:1 对齐旧 dmworkbase
 * Conversation.componentDidMount 注册 `pendingAttachmentGuard` + `_guardId`)。
 *
 * **覆盖范围**(同 hasAnyAttachment 入参):
 * - 顶部附件区(topAttachments,Composer state)
 * - 编辑器内 inline attachment node(editor.getJSON 扫 `attachment` 节点)
 *
 * **关键**:
 * - register 返回 instance id(Symbol),unregister 只清自己注册的那一份。
 *   防"新 Composer mount → 旧 Composer unmount → 把新注册的覆盖清掉"竞态。
 * - 用 ref capture editor + hasAnyAttachment 最新值,effect 只挂一次(empty deps),
 *   避免 hasAnyAttachment useCallback deps 变化反复 register。
 *
 * 在 component 本体禁止裸 useEffect — 故包成命名 hook。
 */
export function usePendingAttachmentGuard(
  editor: Editor | null,
  hasAnyAttachment: (editor: Editor | null) => boolean,
): void {
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const checkRef = useRef(hasAnyAttachment);
  checkRef.current = hasAnyAttachment;

  useEffect(() => {
    const id = chatPendingAttachmentRegistry.register(() => checkRef.current(editorRef.current));
    return () => chatPendingAttachmentRegistry.unregister(id);
  }, []);
}
