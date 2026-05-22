import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LoginView } from "@/features/login/views/login.view";

const loginSearchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: function LoginRouteComponent() {
    const { redirect } = Route.useSearch();
    return <LoginView redirect={redirect} />;
  },
});
