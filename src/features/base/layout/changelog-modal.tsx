import { useEffect, useState } from "react";
import { getChangelog, type ChangelogResp } from "@/features/base/api/endpoints/updater.api";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface ChangelogModalProps {
  open: boolean;
  onClose: () => void;
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
 *
 * 浮动元素壳层统一规范 Phase C2 — 走 BaseDialog,**用 z-system-overlay 覆盖**默认 z-dialog
 * (changelog 是系统级通知,必须在所有业务 modal 之上;对齐老仓 z-[210])。
 *
 * 卡片宽 480px(固定,跟老仓一致)→ size=fit + className 控宽。
 */
export function ChangelogModal({ open, onClose }: ChangelogModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChangelogResp | null>(null);
  useFetchChangelog(open, setLoading, setData);

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
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title="更新日志"
      // z-system-overlay 覆盖默认 z-dialog,@utility source order 后定义的 system-overlay 数值 600 赢
      className="z-system-overlay w-[480px] max-h-[70vh]"
    >
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
    </BaseDialog>
  );
}
