import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { EmojiSuggestItem } from "@/features/chat/lib/emoji-suggestion";

interface EmojiSuggestionListProps {
  items: EmojiSuggestItem[];
  command: (item: EmojiSuggestItem) => void;
}

export interface EmojiSuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

function useResetActive(items: EmojiSuggestItem[], setActiveIndex: (index: number) => void) {
  useEffect(() => {
    setActiveIndex(0);
  }, [items, setActiveIndex]);
}

export const EmojiSuggestionList = forwardRef<EmojiSuggestionListRef, EmojiSuggestionListProps>(
  ({ items, command }, ref) => {
    const [activeIndex, setActiveIndex] = useState(0);
    useResetActive(items, setActiveIndex);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          setActiveIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          setActiveIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const item = items[activeIndex];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;
    return (
      <div className="flex max-w-[420px] gap-1 overflow-x-auto rounded-md bg-bg-surface p-2 shadow-lg">
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={item.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                command(item);
              }}
              onPointerMove={() => setActiveIndex(index)}
              className={`flex h-12 min-w-20 items-center gap-2 rounded px-2 text-left ${
                active ? "bg-brand text-text-inverse" : "text-text-primary hover:bg-brand-tint"
              }`}
            >
              <img src={item.image} alt="" className="h-7 w-7 shrink-0 object-contain" />
              <span className="min-w-0 truncate text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  },
);
