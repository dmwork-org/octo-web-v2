import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

/**
 * tiptap Placeholder extension 的 placeholder 字符串在 useEditor 配置时被
 * **plugin 闭包捕获**,后续 React 重渲染 `Placeholder.configure({placeholder})`
 * 重传字符串不会更新已 mounted editor 的显示(useEditor 不重跑配置)。
 *
 * **修法**(配合 caller 用 ref + callback placeholder):
 *   1. caller 持 `placeholderRef = useRef(placeholder)`,render-time 同步
 *      `placeholderRef.current = placeholder`
 *   2. Placeholder.configure 用 callback: `placeholder: () => placeholderRef.current`
 *      (tiptap 官方支持回调形式,每次 decoration 重算时被调)
 *   3. 本 hook 监听 placeholder 变化 → dispatch 空 transaction 强制 ProseMirror
 *      重跑 props.decorations → Placeholder 回调被调 → 读 ref 拿新文案
 *
 * 抽成命名 hook 满足 no-useeffect-in-component 约束。
 */
export function useDispatchOnPlaceholderChange(editor: Editor | null, placeholder: string): void {
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.view.state.tr);
  }, [editor, placeholder]);
}
