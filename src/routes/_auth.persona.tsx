import { createFileRoute } from "@tanstack/react-router";
import { PersonaListView } from "@/features/persona/views/persona-list.view";

/** AI 分身列表临时路径 `/persona`。块 9 设置主页完成后迁移到 `/settings/persona`。 */
export const Route = createFileRoute("/_auth/persona")({
  component: () => <PersonaListView />,
});
