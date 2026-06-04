import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PersonaDetailView } from "@/features/persona/views/persona-detail.view";

/** Persona 详情(Scope 管理)临时路径 `/personadetail?id=xxx`(用 search 代 $id)。 */
const searchSchema = z.object({ id: z.coerce.number() });

export const Route = createFileRoute("/_auth/personadetail")({
  validateSearch: searchSchema,
  component: function PersonaDetailRouteComponent() {
    const { id } = Route.useSearch();
    return <PersonaDetailView grantId={id} />;
  },
});
