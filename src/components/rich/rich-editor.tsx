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

/**
 * 当外部 value 变化(比如 query refetch 拿到最新 description)且与 editor 内部
 * HTML 不同时,同步进 editor。命名 hook 包 useEffect 符合 no-useeffect-in-component。
 *
 * **防循环**:用 useRef 记录最后一次同步进 editor 的 value,只有外部 value 与
 * ref 不同时才 setContent。这样 editor onUpdate → onChange → setDraft → value
 * 变化时,value 与 ref 相同(都是刚从 editor 拿出来的 HTML),不会触发二次 setContent,
 * 避免无限循环。
 */
function useSyncExternalValue(editor: Editor | null, value: string) {
  const lastSynced = useRef(value);
  useEffect(() => {
    if (!editor) return;
    // 只有外部 value 与上次同步值不同时才更新(防止 onUpdate→onChange→value 循环)
    if (value !== lastSynced.current) {
      lastSynced.current = value;
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);
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
      onChange?.(e.getHTML());
    },
    onBlur: ({ editor: e }) => {
      onBlur?.(e.getHTML());
    },
  });

  useSyncExternalValue(editor, value);

  return <EditorContent editor={editor} />;
}
