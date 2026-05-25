import { createFileRoute } from "@tanstack/react-router";
import { ChatView } from "@/features/chat/views/chat.view";

export const Route = createFileRoute("/_auth/")({
  staticData: { menu: { sort: 1000, title: "会话", icon: "chat" } },
  component: ChatView,
});
