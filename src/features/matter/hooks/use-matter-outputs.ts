import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listOutputs } from "@/features/matter/api/matter.api";
import { matterOutputsQueryKey } from "@/features/matter/queries/matters.query";
import type { MatterOutput } from "@/features/matter/types/matter.types";
import { useT } from "@/lib/i18n/use-t";

const OUTPUTS_PAGE_LIMIT = 50;

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
 * Outputs 数据管理 hook:初次加载 + 搜索 + cursor 分页 + race guard。
 *
 * 搜索/初次加载通过 useQuery 自动管理(queryKey 含 matterId + searchQ)。
 * debounce 由 OutputsPanel 组件内部处理，hook 收到的已经是防抖后的值。
 * "加载更多"直接调 API,成功后通过 queryClient.setQueryData 追加到缓存。
 */
export function useMatterOutputs(matterId: string): UseMatterOutputsReturn {
  const t = useT();
  const qc = useQueryClient();

  // 搜索状态:searchQ 是实际传给 query 的值(debounce 已在组件层完成)
  const [searchQ, setSearchQ] = useState("");

  // cursor 分页状态(仅 load-more 路径使用)
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);

  // seq guard:防止过期的 load-more 响应覆盖新数据
  const loadMoreSeqRef = useRef(0);

  // useQuery:初次加载 + 搜索(searchQ 变化时自动重新请求)
  const {
    data: queryData,
    isLoading,
    isFetching,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: matterOutputsQueryKey(matterId, searchQ),
    queryFn: () => listOutputs(matterId, { limit: OUTPUTS_PAGE_LIMIT, q: searchQ || undefined }),
    staleTime: 30 * 1000,
  });

  // 搜索:直接更新 query key(debounce 由 OutputsPanel 内部处理)
  const handleSearch = useCallback((val: string) => {
    setSearchQ(val);
    setCursor(undefined);
    setHasMore(false);
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
      q: searchQ || undefined,
    })
      .then((res) => {
        if (seq !== loadMoreSeqRef.current) return;
        const key = matterOutputsQueryKey(matterId, searchQ);
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
  }, [matterId, searchQ, queryData, cursor, loadMoreLoading, qc]);

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
    query: searchQ,
    error: queryError ? t("matter.outputs.loadFailed") : null,
    handleSearch,
    handleLoadMore,
    handleRetry,
  };
}
