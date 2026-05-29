import { createFileRoute } from "@tanstack/react-router";
import { spaceStore } from "@/features/base/stores/space";
import {
  myBotsQueryOptions,
  myGroupsQueryOptions,
  spaceBotsQueryOptions,
  spaceMembersQueryOptions,
} from "@/features/contacts/queries/directory.query";
import { ContactsView } from "@/features/contacts/views/contacts.view";

export const Route = createFileRoute("/_auth/contacts")({
  /**
   * 首屏机会主义预热 directory 4 个 query(spaceMembers / myBots / spaceBots /
   * myGroups)— spaceId 同步从 store 读。spaceId 缺失则跳过,组件挂载时
   * `enabled: !!spaceId` gate 自动兜住。沿用 P3-matter loader 范式。
   */
  loader: ({ context }) => {
    const spaceId = spaceStore.state.spaceId;
    if (!spaceId) return;
    return Promise.all([
      context.queryClient.ensureQueryData(spaceMembersQueryOptions(spaceId)),
      context.queryClient.ensureQueryData(myBotsQueryOptions(spaceId)),
      context.queryClient.ensureQueryData(spaceBotsQueryOptions(spaceId)),
      context.queryClient.ensureQueryData(myGroupsQueryOptions(spaceId)),
    ]);
  },
  staticData: { menu: { sort: 4000, title: "通讯录", icon: "contacts" } },
  component: ContactsView,
});
