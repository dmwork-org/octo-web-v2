import { ChannelTypeGroup, type Conversation } from "wukongimjssdk";
import { cn } from "@/lib/utils";

interface SummarySourcePickerProps {
  candidates: Conversation[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  emptyLabel: string;
  tagGroupLabel: string;
  tagDirectLabel: string;
  className?: string;
}

export function SummarySourcePicker({
  candidates,
  selectedIds,
  onToggle,
  emptyLabel,
  tagGroupLabel,
  tagDirectLabel,
  className,
}: SummarySourcePickerProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 overflow-y-auto rounded-md border border-border-default bg-bg-base p-1",
        className,
      )}
    >
      {candidates.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-text-tertiary">{emptyLabel}</div>
      ) : (
        candidates.map((conversation) => {
          const id = conversation.channel.channelID;
          const checked = selectedIds.has(id);
          const isGroup = conversation.channel.channelType === ChannelTypeGroup;
          const name = conversation.channelInfo?.title ?? id;
          return (
            <label
              key={`${conversation.channel.channelType}-${id}`}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-bg-hover",
                checked && "bg-brand-tint",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(id)}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 truncate text-text-primary">{name}</span>
              <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] text-text-tertiary">
                {isGroup ? tagGroupLabel : tagDirectLabel}
              </span>
            </label>
          );
        })
      )}
    </div>
  );
}
