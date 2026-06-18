import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Check, X } from "lucide-react";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { cn } from "@/lib/utils";

interface MemberLike {
  uid: string;
  name?: string;
}

export function MemberAvatar({ uid, name, size }: { uid: string; name?: string; size: number }) {
  return (
    <ChannelAvatar channel={new Channel(uid, ChannelTypePerson)} size={size} title={name || uid} />
  );
}

export function MemberName({
  name,
  uid,
  className,
}: {
  name?: string;
  uid: string;
  className?: string;
}) {
  return <span className={cn("min-w-0 flex-1 truncate", className)}>{name || uid}</span>;
}

interface SelectableMemberRowProps {
  uid: string;
  name?: string;
  checked: boolean;
  onToggle: (uid: string) => void;
  avatarSize?: number;
  checkboxVariant?: "native" | "brand";
  rowClassName?: string;
  nameClassName?: string;
  checkedClassName?: string;
  trailing?: ReactNode;
}

export function SelectableMemberRow({
  uid,
  name,
  checked,
  onToggle,
  avatarSize = 32,
  checkboxVariant = "native",
  rowClassName = "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-bg-hover",
  nameClassName = "text-sm text-text-primary",
  checkedClassName = "bg-brand-tint",
  trailing,
}: SelectableMemberRowProps) {
  return (
    <label
      className={cn(rowClassName, checked && checkedClassName)}
      onClick={(event) => {
        if (checkboxVariant === "brand") {
          event.preventDefault();
          onToggle(uid);
        }
      }}
    >
      {checkboxVariant === "brand" ? (
        <span
          role="checkbox"
          aria-checked={checked}
          className={cn(
            "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors",
            checked
              ? "border-brand bg-brand text-text-inverse"
              : "border-border-strong bg-bg-surface",
          )}
        >
          {checked ? <Check size={12} strokeWidth={2.5} /> : null}
        </span>
      ) : (
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(uid)}
          className="shrink-0"
        />
      )}
      <MemberAvatar uid={uid} name={name} size={avatarSize} />
      <MemberName uid={uid} name={name} className={nameClassName} />
      {trailing}
    </label>
  );
}

interface SelectedMemberRowProps {
  uid: string;
  name?: string;
  onRemove: (uid: string) => void;
  removeLabel: string;
  trailing?: ReactNode;
}

export function SelectedMemberRow({
  uid,
  name,
  onRemove,
  removeLabel,
  trailing,
}: SelectedMemberRowProps) {
  return (
    <div className="group flex h-9 items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]">
      <MemberAvatar uid={uid} name={name} size={28} />
      <MemberName uid={uid} name={name} className="text-[14px] text-text-primary" />
      {trailing}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(uid);
        }}
        aria-label={removeLabel}
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[rgba(28,28,35,0.4)] transition-colors hover:bg-[rgba(28,28,35,0.06)] hover:text-text-primary"
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

interface VirtualizedSelectListProps<T> {
  items: T[];
  empty: ReactNode;
  rowHeight: number;
  overscan: number;
  renderRow: (item: T) => ReactNode;
}

export function VirtualizedSelectList<T>({
  items,
  empty,
  rowHeight,
  overscan,
  renderRow,
}: VirtualizedSelectListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  if (items.length === 0) {
    return <div className="flex-1 overflow-y-auto py-1">{empty}</div>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto py-1">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) return null;
          return (
            <div
              key={virtualItem.key}
              className="absolute top-0 left-0 w-full"
              style={{
                height: virtualItem.size,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MemberChoiceListProps<T extends MemberLike> {
  items: T[];
  selectedIds: Set<string>;
  onToggle: (uid: string) => void;
  empty: ReactNode;
}

export function MemberChoiceList<T extends MemberLike>({
  items,
  selectedIds,
  onToggle,
  empty,
}: MemberChoiceListProps<T>) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
      {items.length === 0
        ? empty
        : items.map((member) => (
            <SelectableMemberRow
              key={member.uid}
              uid={member.uid}
              name={member.name}
              checked={selectedIds.has(member.uid)}
              onToggle={onToggle}
            />
          ))}
    </div>
  );
}

interface SelectedPreviewPaneProps<T> {
  items: T[];
  emptyLabel: ReactNode;
  countLabel: ReactNode;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}

export function SelectedPreviewPane<T>({
  items,
  emptyLabel,
  countLabel,
  getKey,
  renderItem,
}: SelectedPreviewPaneProps<T>) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden py-2">
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[13px] text-[rgba(28,28,35,0.35)]">
          {emptyLabel}
        </div>
      ) : (
        <>
          <div className="shrink-0 px-2 pb-1.5 text-[12px] text-[rgba(28,28,35,0.4)]">
            {countLabel}
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.map((item) => (
              <div key={getKey(item)}>{renderItem(item)}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
