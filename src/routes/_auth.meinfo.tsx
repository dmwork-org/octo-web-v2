import { createFileRoute } from "@tanstack/react-router";
import { MeInfoView } from "@/features/user/views/me-info.view";

/**
 * 个人信息页临时路径 `/meinfo`。
 * 块 9 设置主页完成后会迁移到 `/settings/me`。
 */
export const Route = createFileRoute("/_auth/meinfo")({
  component: () => <MeInfoView />,
});
