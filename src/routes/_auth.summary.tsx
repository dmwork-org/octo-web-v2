import { createFileRoute } from "@tanstack/react-router";
import { SummaryView } from "@/features/summary/views/summary.view";

export const Route = createFileRoute("/_auth/summary")({
  staticData: { menu: { sort: 5000, title: "summary.menu.title", icon: "summary" } },
  component: SummaryView,
});
