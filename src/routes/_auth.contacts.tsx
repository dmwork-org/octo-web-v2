import { createFileRoute } from "@tanstack/react-router";
import { ContactsView } from "@/features/contacts/views/contacts.view";

export const Route = createFileRoute("/_auth/contacts")({
  staticData: { menu: { sort: 4000, title: "通讯录", icon: "contacts" } },
  component: ContactsView,
});
