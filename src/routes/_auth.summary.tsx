import { createFileRoute } from "@tanstack/react-router";
import { SummaryView } from "@/features/summary/views/summary.view";

export const Route = createFileRoute("/_auth/summary")({
  staticData: { menu: { sort: 5000, title: "智能总结", icon: "summary" } },
  component: SummaryView,
});
