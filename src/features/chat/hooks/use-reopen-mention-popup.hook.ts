import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";

/**
 * subscribers 从 0 → 非 0 时,**让 Tiptap suggestion plugin 重开当前 mention popup**
 * (issue #117 followup):
 *
 * 真凶:Tiptap suggestion plugin 一旦 popup 打开,**只在 query / selection 变化时**
 * 才重调 `items()`。用户刷新后立刻输入 @(或 draft 恢复出现 @),subscribers
 * 还在 HTTP 拉取中(=0),popup 锁定 sticky-only(2 项);subs 到位后 popup
 * 不会自动刷新。
 *
 * 修法:让光标在原位置左右各跳一次 — selection 短暂离开 @ 触发器 →
 * suggestion plugin onExit;立即回原位 → plugin 检测到 @ → onStart 用最新
 * `candidatesRef` 重建 popup。两次 dispatch 在同一 tick 内完成,不需用户重输 @。
 *
 * 用 ref 跟踪 previous length,只在真正 0 → 非 0 触发,避免反复评估。
 */
export function useReopenMentionPopupOnSubscribersReady(
  editor: Editor | null,
  subscribersLen: number,
): void {
  const prevLenRef = useRef(subscribersLen);
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = subscribersLen;
    if (prev !== 0 || subscribersLen === 0 || !editor) return;
    // 只在当前真有 mention popup 显示时操作 — 用 listbox 子节点验证,避免误触
    // 项目里其他 tippy(Tooltip / 头像菜单)也会留 [data-tippy-root]
    const mentionPopup = document.querySelector('[data-tippy-root] [role="listbox"]');
    if (!mentionPopup) return;
    const { state, dispatch } = editor.view;
    const orig = state.selection;
    // 选个保证不同的位置:能往前就往前一格,否则往后(@ 在文档开头的极端情况)
    const tempPos =
      orig.from > 0 ? orig.from - 1 : Math.min(orig.from + 1, state.doc.content.size);
    if (tempPos === orig.from) return;
    // 离开触发位置 → plugin onExit 关 popup;再回原位 → plugin onStart 用
    // 当前 candidatesRef 重建 popup
    dispatch(state.tr.setSelection(TextSelection.create(state.doc, tempPos)));
    dispatch(editor.view.state.tr.setSelection(orig));
  }, [editor, subscribersLen]);
}
