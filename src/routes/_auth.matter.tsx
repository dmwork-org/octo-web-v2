import { createFileRoute } from "@tanstack/react-router";
import { MatterView } from "@/features/matter/views/matter.view";

export const Route = createFileRoute("/_auth/matter")({
  staticData: { menu: { sort: 4001, title: "事项", icon: "matter" } },
  component: MatterView,
});
