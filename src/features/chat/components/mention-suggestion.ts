import { escapeForRegEx } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type {
  SuggestionKeyDownProps,
  SuggestionMatch,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { MentionList, type MentionItem, type MentionListRef } from "./mention-list";

/**
 * 自定义 findSuggestionMatch:解除 TipTap 默认 `@ 前必须是空白或开头` 的限制,
 * 允许 @ 在任意位置触发(中文输入 / 已有文本中插入 @ 的场景)。
 *
 * 与官方实现唯一差异:regex 不再 require `(?:^|\s)` 前缀。逻辑(range 计算 / query
 * 提取)完全一致。
 *
 * 旧 dmworkbase findSuggestionMatchAnyPrefix 同等语义。
 */
function findSuggestionMatchAnyPrefix(config: {
  char: string;
  allowSpaces: boolean;
  startOfLine: boolean;
  $position: { pos: number; nodeBefore: { isText?: boolean; text?: string } | null };
}): SuggestionMatch {
  const { char, allowSpaces, startOfLine, $position } = config;
  const escapedChar = escapeForRegEx(char);
  const prefix = startOfLine ? "^" : "";
  const regexp = allowSpaces
    ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${escapedChar}|$)`, "gm")
    : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${escapedChar}]*`, "gm");

  const nodeBefore = $position.nodeBefore;
  const text = nodeBefore?.isText && nodeBefore.text;
  if (!text) return null;

  const textFrom = $position.pos - text.length;
  const matches = [...text.matchAll(regexp)];
  const match = matches.pop();
  if (!match || match.input === undefined || match.index === undefined) return null;

  const from = textFrom + match.index;
  const to = from + match[0].length;
  if (from < $position.pos && to >= $position.pos) {
    const query = match[0].slice(char.length);
    // @ 后纯数字(@123)不当 mention — 避免数字打断 URL 后 Enter 发送
    if (/^\d+$/.test(query)) return null;
    return { range: { from, to }, query, text: match[0] };
  }
  return null;
}

/**
 * @ mention suggestion factory(对应旧 mentionSuggestion.tsx):
 *
 * - findSuggestionMatch 解除前缀限制,@ 任意位置可触发
 * - 候选 = 父组件 itemsFn 提供(`@所有人` + spaceMembers 真人)
 * - 选中 → SuggestionProps.command 触发 TipTap 默认 commandHandler 插入 Mention node
 *   (node.attrs 直接拿 item 的 {id,label})
 * - tippy.js 弹 popover,定位用 `props.clientRect`;onStart 时 items 可能为空
 *   (空 query 命中过滤后无候选),所以即使空也 create popup,后续 onUpdate 再 show
 */
export function createMentionSuggestion(
  itemsFn: (query: string) => MentionItem[],
): Omit<SuggestionOptions<MentionItem, MentionItem>, "editor"> {
  return {
    items: ({ query }) => itemsFn(query),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findSuggestionMatch: findSuggestionMatchAnyPrefix as any,

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
            showOnCreate: props.items.length > 0,
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
