import { useEffect } from "react";

export function useFetchNextOnInView(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  fetchNextPage: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled, fetchNextPage]);
}
