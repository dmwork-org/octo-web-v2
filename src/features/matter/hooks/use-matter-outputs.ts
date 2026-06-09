import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listOutputs } from "@/features/matter/api/matter.api";
import { matterOutputsQueryKey } from "@/features/matter/queries/matters.query";
import type { MatterOutput } from "@/features/matter/types/matter.types";
import { useT } from "@/lib/i18n/use-t";

const OUTPUTS_PAGE_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface UseMatterOutputsReturn {
  outputs: MatterOutput[];
  loading: boolean;
  hasMore: boolean;
  query: string;
  error: string | null;
  handleSearch: (q: string) => void;
  handleLoadMore: () => void;
  handleRetry: () => void;
}

/**
 * Outputs 数据管理 hook:初次加载 + 搜索(debounce) + cursor 分页 + race guard。
 *
 * 搜索/初次加载通过 useQuery 自动管理(queryKey 含 matterId + debouncedQ)。
 * "加载更多"直接调 API,成功后通过 queryClient.setQueryData 追加到缓存。
 */
export function useMatterOutputs(matterId: string): UseMatterOutputsReturn {
  const t = useT();
  const qc = useQueryClient();

  // 搜索状态:debouncedQ 是实际传给 query 的值(经过 300ms 防抖)
  const [debouncedQ, setDebouncedQ] = useState("");
  const [displayQ, setDisplayQ] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cursor 分页状态(仅 load-more 路径使用)
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);

  // seq guard:防止过期的 load-more 响应覆盖新数据
  const loadMoreSeqRef = useRef(0);

  // useQuery:初次加载 + 搜索(debouncedQ 变化时自动重新请求)
  const {
    data: queryData,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: matterOutputsQueryKey(matterId, debouncedQ),
    queryFn: () => listOutputs(matterId, { limit: OUTPUTS_PAGE_LIMIT, q: debouncedQ || undefined }),
    staleTime: 30 * 1000,
  });

  // 搜索:300ms debounce
  const handleSearch = useCallback((val: string) => {
    setDisplayQ(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedQ(val);
      setCursor(undefined);
      setHasMore(false);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  // 加载更多:直接调 API,成功后追加到 query cache
  const handleLoadMore = useCallback(() => {
    const currentCursor = queryData?.pagination?.next_cursor ?? cursor;
    if (!currentCursor || loadMoreLoading) return;

    const seq = ++loadMoreSeqRef.current;
    setLoadMoreLoading(true);

    listOutputs(matterId, {
      limit: OUTPUTS_PAGE_LIMIT,
      cursor: currentCursor,
      q: debouncedQ || undefined,
    })
      .then((res) => {
        if (seq !== loadMoreSeqRef.current) return;
        const key = matterOutputsQueryKey(matterId, debouncedQ);
        qc.setQueryData(key, (prev: typeof queryData) => {
          if (!prev) return res;
          return {
            data: [...prev.data, ...(res.data || [])],
            pagination: res.pagination,
          };
        });
        setCursor(res.pagination?.next_cursor);
        setHasMore(res.pagination?.has_more ?? false);
      })
      .catch(() => {
        if (seq !== loadMoreSeqRef.current) return;
      })
      .finally(() => {
        if (seq === loadMoreSeqRef.current) setLoadMoreLoading(false);
      });
  }, [matterId, debouncedQ, queryData, cursor, loadMoreLoading, qc]);

  // 重试
  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // 从 query 数据同步 hasMore(初次加载 / 搜索后)
  const effectiveHasMore = isFetching ? hasMore : (queryData?.pagination?.has_more ?? false);

  const outputs = queryData?.data ?? [];

  return {
    outputs,
    loading: isLoading || isFetching || loadMoreLoading,
    hasMore: effectiveHasMore,
    query: displayQ,
    error: queryError ? t("matter.outputs.loadFailed") : null,
    handleSearch,
    handleLoadMore,
    handleRetry,
  };
}
