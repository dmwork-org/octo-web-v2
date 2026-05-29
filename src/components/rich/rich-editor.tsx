import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Link } from "@tiptap/extension-link";
import { useEffect } from "react";
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
 */
function useSyncExternalValue(editor: Editor | null, value: string) {
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);
}

/**
 * 通用 RichEditor(TipTap StarterKit + Placeholder + Link),纯净版无工具栏。
 *
 * 设计稿里 description 的"主要目标"区显示为平面段落,需要的就是这种轻富文本:
 * 段落 / 加粗 / 列表 / 链接,无标题级别 / 表格 / 图片。Matter timeline 评论
 * 输入(Commit 16)也复用此 editor。
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
      Link.configure({
        openOnClick: !readOnly,
        autolink: true,
        HTMLAttributes: { class: "underline text-brand", rel: "noopener" },
      }),
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
