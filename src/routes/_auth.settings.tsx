import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/features/user/views/settings.view";

export const Route = createFileRoute("/_auth/settings")({
  component: () => <SettingsView />,
});
