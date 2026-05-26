import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { MentionList, type MentionItem, type MentionListRef } from "./mention-list";

/**
 * @ mention suggestion factory(对应旧 mentionSuggestion.tsx 简化版):
 *
 * - 候选 = 父组件 itemsFn 提供(`@所有人` + spaceMembers 真人,id 是 uid;
 *   item.id 是特殊 sentinel `@all` 时表示 @所有人)
 * - 选中 → SuggestionProps.command 触发 TipTap 默认 commandHandler 插入 Mention node
 *   (node.attrs 直接拿 item 的 {id,label})
 * - tippy.js 弹 popover,定位用 `props.clientRect`
 *
 * 类型 quirk:`ReactRenderer` 第二个 generic 期望和 props 形状一致,实际 TipTap 给的
 * 是 `SuggestionProps` 超集 — MentionList 自己只解构 items/command,用 `any` 兜底
 * 避开类型噪音。
 */
export function createMentionSuggestion(
  itemsFn: (query: string) => MentionItem[],
): Omit<SuggestionOptions<MentionItem, MentionItem>, "editor"> {
  return {
    items: ({ query }) => itemsFn(query),

    render: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let component: ReactRenderer<MentionListRef, any> | null = null;
      let popup: TippyInstance[] | null = null;

      const getRect = (props: SuggestionProps<MentionItem>) => {
        const r = props.clientRect?.();
        return r ?? new DOMRect(0, 0, 0, 0);
      };

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          if (!props.clientRect) return;
          popup = tippy("body", {
            getReferenceClientRect: () => getRect(props),
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
          });
        },

        onUpdate: (props) => {
          if (!component) return;
          component.updateProps(props);
          if (!props.items.length) {
            popup?.[0]?.hide();
            return;
          }
          popup?.[0]?.show();
          if (!props.clientRect) return;
          popup?.[0]?.setProps({ getReferenceClientRect: () => getRect(props) });
        },

        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown({ event: props.event }) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
          popup = null;
          component = null;
        },
      };
    },
  };
}
