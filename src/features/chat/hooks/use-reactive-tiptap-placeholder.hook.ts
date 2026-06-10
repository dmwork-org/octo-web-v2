import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

/**
 * tiptap Placeholder extension 在 `useEditor` 配置时被实例化,placeholder 字符串
 * 锁定在 extension options 内,后续 React 重渲染 `Placeholder.configure({placeholder})`
 * 也不会更新已 mounted editor 的 placeholder(useEditor 不重跑配置)。
 *
 * 表现:切换语言后,composer 输入框 placeholder 仍是旧语言文案。
 *
 * 修法:placeholder 变化时,直接 patch extension options + dispatch 一个空
 * transaction 触发 Placeholder 的 decoration 重算 → 立刻反映新值。
 *
 * 抽成命名 hook 满足 no-useeffect-in-component 约束。
 */
export function useReactiveTiptapPlaceholder(editor: Editor | null, placeholder: string): void {
  useEffect(() => {
    if (!editor) return;
    const ext = editor.extensionManager.extensions.find((e) => e.name === "placeholder");
    if (!ext) return;
    (ext.options as { placeholder?: string }).placeholder = placeholder;
    // 空 transaction 触发 view 重新计算 decorations(placeholder 是装饰层渲染)
    editor.view.dispatch(editor.view.state.tr);
  }, [editor, placeholder]);
}
