import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface VirtualizedListItem<T> {
  type: "header" | "row";
  /** header:letter 文字;row:原 item */
  data: string | T;
}

interface VirtualizedLetterListProps<T> {
  /** [{ letter, items }] 形如 indexByLetter 输出 */
  groups: { letter: string; items: T[] }[];
  /** 单条 item 的 React node 渲染器(不含 sticky header) */
  renderRow: (item: T) => React.ReactNode;
  /** 行估高(默认 44) */
  rowHeight?: number;
  /** letter header 估高(默认 24) */
  headerHeight?: number;
  /** 视口外预渲染 item 数(默认 15) */
  overscan?: number;
  /** 滚动容器额外 className(传 height/maxHeight,默认 h-full) */
  className?: string;
}

/**
 * 通用字母分组虚拟列表(对应旧 dmworkcontacts VirtualContactList,简版):
 *
 * - groups 扁平为 flat[]:每个 letter 1 条 header + N 条 row
 * - useVirtualizer 按估高渲染,header 24 / row 44(可 props 覆盖)
 * - 滚动容器 ref={parentRef},内层 absolute item 用 translateY 定位
 *
 * 用于 contacts > 100 联系人场景。少于 100 仍用普通 map 渲染(不 mount 此组件)。
 */
export function VirtualizedLetterList<T>({
  groups,
  renderRow,
  rowHeight = 44,
  headerHeight = 24,
  overscan = 15,
  className = "h-full",
}: VirtualizedLetterListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const flat = useMemo<VirtualizedListItem<T>[]>(() => {
    const arr: VirtualizedListItem<T>[] = [];
    for (const g of groups) {
      arr.push({ type: "header", data: g.letter });
      for (const it of g.items) arr.push({ type: "row", data: it });
    }
    return arr;
  }, [groups]);

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (flat[index].type === "header" ? headerHeight : rowHeight),
    overscan,
  });

  return (
    <div ref={parentRef} className={`overflow-y-auto ${className}`}>
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = flat[vi.index];
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                height: vi.size,
              }}
            >
              {item.type === "header" ? (
                <div className="bg-bg-base px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                  {item.data as string}
                </div>
              ) : (
                renderRow(item.data as T)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
