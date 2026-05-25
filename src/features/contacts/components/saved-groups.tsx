import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypeGroup } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { GroupCardModal } from "@/features/base/components/modals/group-card-modal";
import { spaceStore } from "@/features/base/stores/space";
import { myGroupsQueryOptions } from "@/features/contacts/queries/directory.query";
import type { GroupSummary } from "@/features/base/api/endpoints/group.api";

/**
 * 保存的群页(对应旧 dmworkcontacts/GroupSave):
 *
 * 数据源 = myGroups(GET /v1/group/my?space_id),复用 directory query。
 * 点击 row → GroupCardModal(里面有"进入群聊"按钮)。
 *
 * 旧版顶部"新建群"按钮 P3+ wave 接入(需要联系人多选 modal + POST
 * /v1/group create)。
 */
export function SavedGroupsPage() {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const { data, isLoading, error } = useQuery({
    ...myGroupsQueryOptions(spaceId),
    enabled: !!spaceId,
  });
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null);

  if (!spaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        先在顶部切换到一个 Space
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        加载群聊…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-error">加载失败</div>
    );
  }
  const groups = data ?? [];
  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        当前 Space 没有群聊
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-2">
      {groups.map((g) => {
        const channel = new Channel(g.group_no, ChannelTypeGroup);
        return (
          <button
            key={g.group_no}
            type="button"
            onClick={() => setSelectedGroup(g)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-bg-hover"
          >
            <ChannelAvatar channel={channel} size={32} title={g.name} />
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{g.name}</span>
            {typeof g.member_count === "number" ? (
              <span className="shrink-0 text-[11px] text-text-tertiary">{g.member_count}</span>
            ) : null}
          </button>
        );
      })}

      <GroupCardModal
        groupNo={selectedGroup?.group_no ?? null}
        fallbackName={selectedGroup?.name}
        fallbackMemberCount={selectedGroup?.member_count}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}
