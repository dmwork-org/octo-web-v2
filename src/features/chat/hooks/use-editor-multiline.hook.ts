import { useEffect, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";

/** 多行触发阈值(对齐旧 dmworkbase MessageInput isLongText 50)。 */
const MULTI_LINE_TEXT_THRESHOLD = 50;

function hasAttachmentNode(json: JSONContent): boolean {
  if (json.type === "attachment") return true;
  if (!json.content) return false;
  for (const c of json.content) {
    if (hasAttachmentNode(c)) return true;
  }
  return false;
}

/**
 * 监听 editor 内容变化,返回是否处于"多行模式"(对齐旧 isMultiLine 判定):
 *   - 多段落(top-level content 多个块)
 *   - 文本含 "\n"
 *   - 文本长度 > 50
 *   - 含 inline attachment node
 *
 * Composer 在 isMultiLine 下把 editor / actionbox 由横排改竖排(actionbox 在下方
 * 右对齐),对齐旧 wk-messageinput-card--multiline CSS。
 */
export function useEditorMultiline(editor: Editor | null): boolean {
  const [isMultiLine, setIsMultiLine] = useState(false);

  useEffect(() => {
    if (!editor) return;
    const calc = () => {
      const text = editor.getText();
      const json = editor.getJSON() as JSONContent;
      const hasMultipleParagraphs = (json.content?.length ?? 0) > 1;
      const hasNewline = text.includes("\n");
      const isLongText = text.length > MULTI_LINE_TEXT_THRESHOLD;
      const hasAttach = hasAttachmentNode(json);
      setIsMultiLine(hasMultipleParagraphs || hasNewline || isLongText || hasAttach);
    };
    calc();
    editor.on("update", calc);
    return () => {
      editor.off("update", calc);
    };
  }, [editor]);

  return isMultiLine;
}
