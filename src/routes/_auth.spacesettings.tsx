import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SpaceSettingsView } from "@/features/space/views/space-settings.view";

/**
 * Space 设置页临时路径 `/spacesettings?id=xxx`。
 *
 * 块 9 设置主页用 React Router-level 嵌套时迁移到 `/settings/space/{id}`。
 *
 * 文件名 `_auth.spacesettings.tsx` — TanStack file-based 路由 dotted segment
 * 不允许 dash(structure-lint 拒);本期改用 search param 而非 $id path param。
 */
const searchSchema = z.object({ id: z.string() });

export const Route = createFileRoute("/_auth/spacesettings")({
  validateSearch: searchSchema,
  component: function SpaceSettingsRouteComponent() {
    const { id } = Route.useSearch();
    return <SpaceSettingsView spaceId={id} />;
  },
});
