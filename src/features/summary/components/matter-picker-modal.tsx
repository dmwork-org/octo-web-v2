import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { spaceStore } from "@/features/base/stores/space";
import { mattersListInfiniteQueryOptions } from "@/features/matter/queries/matters.query";
import { useT } from "@/lib/i18n/use-t";

interface MatterPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (matterId: string, matterTitle: string) => void;
}

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

function useDebouncedValue(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function useResetMatterPickerOnClose(
  open: boolean,
  setInput: (value: string) => void,
  setSelectedId: (id: string | null) => void,
): void {
  useEffect(() => {
    if (!open) {
      setInput("");
      setSelectedId(null);
    }
  }, [open, setInput, setSelectedId]);
}

function useResetMatterPickerSelection(
  keyword: string,
  setSelectedId: (id: string | null) => void,
) {
  useEffect(() => {
    setSelectedId(null);
  }, [keyword, setSelectedId]);
}

export function MatterPickerModal({ open, onClose, onSelect }: MatterPickerModalProps) {
  const tr = useT();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [input, setInput] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const keyword = useDebouncedValue(input.trim());

  useResetMatterPickerOnClose(open, setInput, setSelectedId);
  useResetMatterPickerSelection(keyword, setSelectedId);

  const query = useInfiniteQuery({
    ...mattersListInfiniteQueryOptions(spaceId, {
      status: "open",
      q: keyword || undefined,
      limit: PAGE_SIZE,
    }),
    enabled: open && !!spaceId,
  });

  const matters = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const selectedMatter = matters.find((matter) => matter.id === selectedId);

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      title={tr("summary.matterPicker.title")}
      contentClassName="gap-3 p-4"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="tertiary" theme="borderless" size="small" onClick={onClose}>
            {tr("summary.common.cancel")}
          </Button>
          <Button
            type="primary"
            theme="solid"
            size="small"
            disabled={!selectedMatter}
            onClick={() => {
              if (selectedMatter) onSelect(selectedMatter.id, selectedMatter.title);
            }}
          >
            {tr("summary.common.confirm")}
          </Button>
        </div>
      }
    >
      <div className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-bg-elevated px-3">
        <Search size={15} className="text-text-tertiary" />
        <input
          autoFocus
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={tr("summary.matterPicker.searchPlaceholder")}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>

      <div className="flex max-h-80 min-h-60 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle bg-bg-base p-1">
        {query.isLoading && matters.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tr("summary.common.loading")}
          </div>
        ) : query.isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-error">
            {tr("summary.matterPicker.loadFailed")}
          </div>
        ) : matters.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
            {tr("summary.matterPicker.empty")}
          </div>
        ) : (
          <>
            {matters.map((matter) => {
              const selected = matter.id === selectedId;
              return (
                <button
                  key={matter.id}
                  type="button"
                  onClick={() => setSelectedId(matter.id)}
                  className={`flex min-h-10 items-center gap-2 rounded-sm px-2 text-left transition-colors ${
                    selected ? "bg-brand-tint" : "hover:bg-bg-hover"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border-default bg-bg-surface text-brand">
                    {selected ? <Check size={12} /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {matter.title}
                  </span>
                  <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-tertiary">
                    {matter.status}
                  </span>
                </button>
              );
            })}
            {query.hasNextPage ? (
              <button
                type="button"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mt-1 flex h-8 items-center justify-center rounded-sm text-xs text-brand transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:text-text-tertiary"
              >
                {query.isFetchingNextPage
                  ? tr("summary.common.loading")
                  : tr("summary.matterPicker.loadMore")}
              </button>
            ) : null}
          </>
        )}
      </div>
    </BaseDialog>
  );
}
