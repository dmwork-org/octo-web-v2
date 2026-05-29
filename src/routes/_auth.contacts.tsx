import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ContactsView } from "@/features/contacts/views/contacts.view";

/**
 * URL search:?sub={page} 选中子页,刷新保留 + 链接可分享。
 * sub 缺省 → directory 主目录。
 */
const contactsSearchSchema = z.object({
  sub: z.enum(["directory", "applies", "add", "blacklist", "saved-groups"]).default("directory"),
});

export const Route = createFileRoute("/_auth/contacts")({
  validateSearch: contactsSearchSchema,
  staticData: { menu: { sort: 4000, title: "通讯录", icon: "contacts" } },
  component: ContactsView,
});
