import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionMatch,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  buildEmojiSuggestItems,
  matchEmojiPrefix,
  type EmojiSuggestItem,
} from "@/features/chat/lib/emoji-suggestion";
import {
  EmojiSuggestionList,
  type EmojiSuggestionListRef,
} from "@/features/chat/components/emoji-suggestion-list";
import { canHideMentionPopup } from "@/features/chat/components/mention-suggestion";

export const emojiSuggestionPluginKey = new PluginKey("emojiSuggestion");

function findEmojiSuggestionMatch(config: {
  $position: { pos: number; nodeBefore: { isText?: boolean; text?: string } | null };
}): SuggestionMatch {
  const nodeBefore = config.$position.nodeBefore;
  const text = nodeBefore?.isText && nodeBefore.text;
  if (!text) return null;
  const matched = matchEmojiPrefix(text);
  if (!matched) return null;
  const to = config.$position.pos;
  const from = to - matched.query.length;
  return { range: { from, to }, query: matched.query, text: matched.query };
}

export function createEmojiSuggestionExtension(
  onActiveChange?: (active: boolean) => void,
): Extension {
  const suggestion: Omit<SuggestionOptions<EmojiSuggestItem, EmojiSuggestItem>, "editor"> = {
    pluginKey: emojiSuggestionPluginKey,
    char: "",
    allowSpaces: false,
    allowedPrefixes: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findSuggestionMatch: findEmojiSuggestionMatch as any,
    items: ({ query }) => buildEmojiSuggestItems(query),
    command: ({ editor, range, props }) => {
      editor.chain().focus().insertContentAt(range, props.key).run();
    },
    render: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let component: ReactRenderer<EmojiSuggestionListRef, any> | null = null;
      let popup: TippyInstance[] | null = null;
      const hidePopup = () => {
        const instance = popup?.[0];
        if (!instance || !canHideMentionPopup(instance)) return;
        instance.hide();
      };
      const getRect = (props: SuggestionProps<EmojiSuggestItem>) =>
        props.clientRect?.() ?? new DOMRect(0, 0, 0, 0);

      return {
        onStart: (props) => {
          if (!props.editor.isFocused || props.items.length === 0) return;
          onActiveChange?.(true);
          component = new ReactRenderer(EmojiSuggestionList, { props, editor: props.editor });
          props.editor.on("blur", hidePopup);
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
          const instance = popup?.[0];
          if (!instance || !canHideMentionPopup(instance)) return;
          if (!props.editor.isFocused || props.items.length === 0) {
            hidePopup();
            return;
          }
          instance.show();
          instance.setProps({ getReferenceClientRect: () => getRect(props) });
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === "Escape") {
            hidePopup();
            return true;
          }
          return component?.ref?.onKeyDown({ event: props.event }) ?? false;
        },
        onExit: () => {
          onActiveChange?.(false);
          component?.editor.off("blur", hidePopup);
          const instance = popup?.[0];
          if (instance) {
            if (canHideMentionPopup(instance) || !instance.state.isVisible) {
              instance.destroy();
            } else {
              instance.clearDelayTimeouts();
              instance.popperInstance?.destroy();
            }
          }
          component?.destroy();
          component = null;
          popup = null;
        },
      };
    },
  };

  return Extension.create({
    name: "emojiSuggestion",
    addProseMirrorPlugins() {
      return [Suggestion({ editor: this.editor, ...suggestion })];
    },
  });
}
