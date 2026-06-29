import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStore } from "@tanstack/react-store";
import { Check, X } from "lucide-react";
import { endpointStore } from "@/features/base/stores/endpoint";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 轻量头像:直接用 avatar URL 渲染,不走 ChannelAvatar / channelInfo 请求。
 * 避免 member-select 列表大量并发请求(issue #160)。
 */
function LiteAvatar({
  uid,
  name,
  avatar,
  size,
}: {
  uid: string;
  name?: string;
  avatar?: string;
  size: number;
}) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const [failed, setFailed] = useState(false);
  const src = avatar
    ? avatar.startsWith("http") || avatar.startsWith("data:")
      ? avatar
      : `${baseURL}/${avatar.replace(/^\/+/, "")}`
    : `${baseURL}/users/${uid}/avatar`;

  const initial = (name || uid).slice(0, 1).toUpperCase();

  if (failed) {
    return (
      <span
        className="shrink-0 rounded-full bg-bg-elevated text-text-secondary"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={name || ""}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full bg-bg-elevated object-cover"
      style={{ width: size, height: size }}
    />
  );
}

interface MemberLike {
  uid: string;
  name?: string;
  avatar?: string;
}

export function MemberAvatar({
  uid,
  name,
  avatar,
  size,
}: {
  uid: string;
  name?: string;
  avatar?: string;
  size: number;
}) {
  return <LiteAvatar uid={uid} name={name} avatar={avatar} size={size} />;
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
  avatar?: string;
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
  avatar,
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
      <MemberAvatar uid={uid} name={name} avatar={avatar} size={avatarSize} />
      <MemberName uid={uid} name={name} className={nameClassName} />
      {trailing}
    </label>
  );
}

interface SelectedMemberRowProps {
  uid: string;
  name?: string;
  avatar?: string;
  onRemove: (uid: string) => void;
  removeLabel: string;
  trailing?: ReactNode;
}

export function SelectedMemberRow({
  uid,
  name,
  avatar,
  onRemove,
  removeLabel,
  trailing,
}: SelectedMemberRowProps) {
  return (
    <div className="group flex h-9 items-center gap-2 px-2 transition-colors hover:bg-[rgba(28,28,35,0.03)]">
      <MemberAvatar uid={uid} name={name} avatar={avatar} size={28} />
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
              avatar={member.avatar}
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
