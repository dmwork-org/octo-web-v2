import { createFileRoute } from "@tanstack/react-router";
import { AppbotView } from "@/features/appbot/views/appbot.view";

export const Route = createFileRoute("/_auth/appbot")({
  staticData: { menu: { sort: 6000, title: "应用", icon: "appbot" } },
  component: AppbotView,
});
