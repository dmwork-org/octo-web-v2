import { useEffect } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import { useStore } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import {
  chatReeditRequestActions,
  chatReeditRequestStore,
  selectPendingReedit,
} from "@/features/chat/stores/chat-reedit-request";

function textToInlineContent(text: string): JSONContent[] {
  const lines = text.split("\n");
  const content: JSONContent[] = [];
  lines.forEach((line, index) => {
    if (index > 0) content.push({ type: "hardBreak" });
    if (line !== "") content.push({ type: "text", text: line });
  });
  return content;
}

export function useApplyReeditRequest(channel: Channel, editor: Editor | null): void {
  const pending = useStore(chatReeditRequestStore, (s) => selectPendingReedit(s, channel));

  useEffect(() => {
    if (!pending || !editor) return;
    const content = textToInlineContent(pending.text);
    if (content.length > 0) {
      editor.chain().focus("end").insertContent(content).run();
    }
    chatReeditRequestActions.consume(channel);
  }, [pending, editor, channel]);
}
