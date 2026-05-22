import { createFileRoute } from "@tanstack/react-router";
import { HomeView } from "@/features/base/views/home.view";

export const Route = createFileRoute("/_auth/")({
  component: HomeView,
});
