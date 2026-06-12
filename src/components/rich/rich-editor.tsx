import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface RichEditorProps {
  /** 受控初始值,组件内部维护 editor state;value 外部更新时同步进 editor。 */
  value: string;
  onChange?: (html: string) => void;
  /** 失焦时回调,适合做 onBlur 自动保存 mutation。 */
  onBlur?: (html: string) => void;
  placeholder?: string;
  /** true 时禁止编辑,只渲染 HTML。详情面板视图态用。 */
  readOnly?: boolean;
  className?: string;
  autoFocus?: boolean;
}

function useSyncExternalValueToEditor(
  editor: Editor | null,
  value: string,
  internalSnapshot: { current: string },
) {
  // 外部 value 同步到 editor(仅当 value 来自外部如 refetch 时)
  useEffect(() => {
    if (!editor) return;
    if (value !== internalSnapshot.current) {
      internalSnapshot.current = value;
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value, internalSnapshot]);
}

/**
 * 通用 RichEditor(TipTap StarterKit + Placeholder),纯净版无工具栏。
 *
 * 设计稿里 description 的"主要目标"区显示为平面段落,需要的就是这种轻富文本:
 * 段落 / 加粗 / 列表,无标题级别 / 表格 / 图片 / 链接。
 * StarterKit 默认不含 Link extension,这里也不额外加,避免 Duplicate extension 冲突。
 *
 * 受控:value 走 prop,onChange 在内容变化时触发,onBlur 适合做自动保存。
 */
export function RichEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  readOnly,
  className,
  autoFocus,
}: RichEditorProps) {
  // 用 ref 追踪内部快照,在 onUpdate 时同步,防止 useEffect 误判为外部变更
  const internalSnapshot = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1",
          readOnly ? "cursor-default" : "min-h-[3rem]",
          className,
        ),
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      // 🔑 关键:编辑器自身内容变更时,立即同步 ref,打断循环
      internalSnapshot.current = html;
      onChange?.(html);
    },
    onBlur: ({ editor: e }) => {
      onBlur?.(e.getHTML());
    },
  });

  useSyncExternalValueToEditor(editor, value, internalSnapshot);

  return <EditorContent editor={editor} />;
}
