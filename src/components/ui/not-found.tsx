import { useT } from "@/lib/i18n/use-t";

/** 404 页面 — 跟 router notFoundComponent 解耦,独立 file 满足 only-export-components 规则 */
export function NotFoundView() {
  const t = useT();
  return (
    <div style={{ padding: 24 }}>
      <h1>404</h1>
      <p>{t("app.notFound")}</p>
    </div>
  );
}
