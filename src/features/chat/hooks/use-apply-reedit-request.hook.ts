import { useEffect } from "react";
import type { Editor } from "@tiptap/react";
import { useStore } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import {
  chatReeditRequestActions,
  chatReeditRequestStore,
  selectPendingReedit,
} from "@/features/chat/stores/chat-reedit-request";

export function useApplyReeditRequest(channel: Channel, editor: Editor | null): void {
  const pending = useStore(chatReeditRequestStore, (s) => selectPendingReedit(s, channel));

  useEffect(() => {
    if (!pending || !editor) return;
    if (pending.content.length > 0) {
      editor.chain().focus("end").insertContent(pending.content).run();
    }
    chatReeditRequestActions.consume(channel);
  }, [pending, editor, channel]);
}
