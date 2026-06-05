import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getChangelog, type ChangelogResp } from "@/features/base/api/endpoints/updater.api";

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
}

/** ESC 关闭。 */
function useEscClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
}

/** open 翻转时拉取 changelog(并避免重复拉)。 */
function useFetchChangelog(
  open: boolean,
  setLoading: (v: boolean) => void,
  setData: (v: ChangelogResp | null) => void,
) {
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    void getChangelog().then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, setLoading, setData]);
}

/**
 * 更新日志 Modal — 对齐老仓 NavSettingsPanel 内嵌的 WKModal "更新日志":
 * - 拉 `GET common/updater/web/1.0`
 * - 显示版本号 + 发布日期 + 多行 notes(`whitespace-pre-wrap`)
 * - 加载中 / 无数据 两态文案
 */
export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChangelogResp | null>(null);
  useEscClose(open, onClose);
  useFetchChangelog(open, setLoading, setData);

  if (!open) return null;

  const pubDateLabel = data?.pub_date
    ? (() => {
        try {
          return new Date(data.pub_date).toLocaleDateString("zh-CN");
        } catch {
          return data.pub_date;
        }
      })()
    : "";

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[70vh] w-[480px] flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">更新日志</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-tertiary">
              加载中…
            </div>
          ) : !data ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-tertiary">
              暂无更新日志
            </div>
          ) : (
            <>
              <div className="mb-3 text-[12px] text-text-tertiary">
                版本 {data.version || "未知"}
                {pubDateLabel ? ` · ${pubDateLabel}` : ""}
              </div>
              <pre className="m-0 font-sans text-[14px] leading-[1.7] whitespace-pre-wrap break-words text-text-primary">
                {data.notes}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
