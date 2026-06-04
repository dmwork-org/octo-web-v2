import { useEffect } from "react";
import {
  parseBindEntryParams,
  clearBindUrl,
  type BindEntryParams,
} from "@/features/bind/lib/parse-entry";

/**
 * BindPage mount effect(对齐老仓 dmworklogin BindPage.useEffect mount):
 *
 * **顺序很关键**:先 capture 到 ref,再 clearBindUrl,反过来会丢 token。
 *
 * - params 无 → onMissing(显 fatal "链接无效")
 * - params 有 → onParsed(显 loading_info,触发 loadInfo)
 */
export function useBindInit(
  initialSearch: string,
  initRanRef: React.MutableRefObject<boolean>,
  entryRef: React.MutableRefObject<BindEntryParams | null>,
  onParsed: (params: BindEntryParams) => void,
  onMissing: () => void,
) {
  useEffect(() => {
    if (initRanRef.current) return;
    initRanRef.current = true;
    const params = parseBindEntryParams(initialSearch);
    if (params) entryRef.current = params;
    clearBindUrl();
    if (!params) {
      onMissing();
      return;
    }
    onParsed(params);
    // initialSearch / refs 都是稳定值;onParsed/onMissing 由 view 用 useCallback 缓存
  }, [initialSearch, initRanRef, entryRef, onParsed, onMissing]);
}
