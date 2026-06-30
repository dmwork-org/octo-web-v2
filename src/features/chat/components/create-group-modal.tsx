import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ConversationAction,
  type Conversation,
} from "wukongimjssdk";
import { Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import {
  SelectableMemberRow,
  SelectedMemberRow,
  SelectedPreviewPane,
} from "@/features/base/components/member-select/member-select";
import {
  filterMembersByKeyword,
  toggleMemberSelection,
} from "@/features/base/components/member-select/member-select-utils";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
import { avatarVersionActions } from "@/features/base/stores/avatar-version";
import { createGroup } from "@/features/base/api/endpoints/group.api";
import { clearConversationUnread } from "@/features/base/api/endpoints/conversation.api";
import { moveGroupToCategory } from "@/features/base/api/endpoints/follow.api";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  /** 若指定,创建成功后把新群 move 到该 category(对应 follow-list 分组右键"新建群聊")。 */
  categoryId?: string;
}

/** open 翻转时 reset 选中 + 关键词。 */
function useResetOnOpen(
  open: boolean,
  setSelected: (v: Set<string>) => void,
  setKeyword: (s: string) => void,
) {
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setKeyword("");
    }
  }, [open, setSelected, setKeyword]);
}

/**
 * 发起群聊弹层(对应旧 dmworkbase OrganizationalGroupNew action=createGroup)。
 *
 * 浮动元素壳层统一规范 Phase C3 — 走 BaseDialog。
 *
 * - 候选 = spaceMembers - 自己(robot 也允许选;后端按需过滤)
 * - 搜索过滤 / 多选
 * - 提交 POST /v1/groups { members: [myUid, ...selected], space_id }
 * - 成功后:invalidate conversations / fetchChannelInfo / select / 可选 moveGroupToCategory
 */
export function CreateGroupModal({ open, onClose, categoryId }: CreateGroupModalProps) {
  const tt = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useResetOnOpen(open, setSelected, setKeyword);

  const { data: members, isLoading } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(() => {
    return (members ?? []).filter((m) => m.uid !== myUid);
  }, [members, myUid]);

  const filtered = useMemo(() => {
    return filterMembersByKeyword(candidates, keyword);
  }, [candidates, keyword]);

  const selectedCandidates = useMemo(() => {
    return candidates.filter((m) => selected.has(m.uid));
  }, [candidates, selected]);

  const mu = useMutation({
    mutationFn: () => {
      const uids = [myUid, ...selected];
      return createGroup({
        members: uids,
        space_id: spaceId || undefined,
      });
    },
    onSuccess: async (resp) => {
      const newChannel = new Channel(resp.group_no, ChannelTypeGroup);
      void WKSDK.shared().channelManager.fetchChannelInfo(newChannel);
      // 头像首屏(issue #64):channelInfo.logo 后端建群时通常为空,channel-avatar
      // 会走 `${baseURL}/groups/{groupNo}/avatar` fallback URL。主动 bump 一个
      // 非零 version,让 fallback URL 首次就带 `?v={ts}`,后端 ready 后即使是
      // 同一 path,version 变化也强制重 GET,绕过潜在的旧 404 cache。
      avatarVersionActions.bump(resp.group_no, ChannelTypeGroup);
      if (categoryId) {
        try {
          await moveGroupToCategory(resp.group_no, categoryId);
          void qc.invalidateQueries({ queryKey: ["chat", "follow", "categories"] });
          void qc.invalidateQueries({ queryKey: ["chat", "follow", "sidebar"] });
        } catch {
          // 静默 — 用户可手动拖到分组
        }
      }
      // 主动清新群未读(issue #1):后端建群完成后会推一条"群创建成功"系统消息,
      // SDK 把它当作普通新消息累加 conversation.unread=1,sidebar / 最近 tab
      // 即出现红点。本端是自己发起的建群操作,该会话必无真实未读,三路同清:
      // - **服务端** PUT clearUnread:让其他端同步看到 unread=0(via unreadClear CMD)
      // - **本地 SDK** conv.unread:挂持续 10s 的 listener — SDK push 时序复杂
      //   (add 时 unread=0,后续系统消息到达再 unread++),一次性 listener 会在
      //   add 那次就 remove 自己,后续 unread+1 没人清。10s 内任何对该 channel
      //   的 conv 更新都 reset unread=0;notify 后 conv.unread 已是 0 不递归
      // - **sidebar query**:invalidate 强刷快照(关注 tab 不订阅 conversationListener)
      void clearConversationUnread({
        channelId: resp.group_no,
        channelType: ChannelTypeGroup,
        unread: 0,
      });
      const cm = WKSDK.shared().conversationManager;
      const clearOnce = () => {
        const conv = cm.findConversation(newChannel);
        if (conv && conv.unread > 0) {
          conv.unread = 0;
          cm.notifyConversationListeners(conv, ConversationAction.update);
        }
      };
      clearOnce();
      const listener = (c: Conversation) => {
        if (c.channel.isEqual(newChannel)) clearOnce();
      };
      cm.addConversationListener(listener);
      setTimeout(() => cm.removeConversationListener(listener), 10000);
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      chatSelectedActions.select(newChannel);
      message.success(t("createGroup.toast.created"));
      onClose();
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("createGroup.toast.failed")),
  });

  const toggle = (uid: string) => {
    toggleMemberSelection(setSelected, uid);
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="fit"
      title={
        selected.size > 0
          ? tt("createGroup.titleWithCount", { values: { count: selected.size } })
          : tt("createGroup.title")
      }
      className="h-[560px] w-[625px]"
      contentClassName="overflow-hidden p-0"
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tt("createGroup.cancel")}
          </Button>
          <Button
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={selected.size === 0}
            onClick={() => mu.mutate()}
          >
            {selected.size > 0
              ? tt("createGroup.createWithCount", { values: { count: selected.size + 1 } })
              : tt("createGroup.create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[296px] shrink-0 flex-col overflow-hidden">
          <div className="mx-2 mt-2 mb-1 flex h-8 shrink-0 items-center gap-2 rounded-full bg-bg-elevated px-3">
            <Search size={14} className="shrink-0 text-[rgba(28,28,35,0.4)]" />
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={tt("createGroup.searchPlaceholder")}
              className="flex-1 border-0 bg-transparent text-[13px] text-text-primary placeholder:text-[rgba(28,28,35,0.35)] focus:outline-none"
            />
          </div>

          <ul className="flex flex-1 flex-col overflow-y-auto py-1">
            {isLoading ? (
              <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {tt("createGroup.loading")}
              </li>
            ) : filtered.length === 0 ? (
              <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
                {keyword ? tt("createGroup.noMatches") : tt("createGroup.noOtherMembers")}
              </li>
            ) : (
              filtered.map((m) => {
                const checked = selected.has(m.uid);
                return (
                  <li key={m.uid} className="px-2">
                    <SelectableMemberRow
                      uid={m.uid}
                      name={m.name}
                      avatar={m.avatar}
                      checked={checked}
                      onToggle={toggle}
                    />
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="w-px shrink-0 bg-[rgba(46,50,56,0.09)]" />

        <SelectedPreviewPane
          items={selectedCandidates}
          emptyLabel={tt("forwardModalLocal.notSelected")}
          countLabel={tt("forwardModalLocal.selectedCount", {
            values: { count: selectedCandidates.length },
          })}
          getKey={(member) => `sel-${member.uid}`}
          renderItem={(member) => (
            <SelectedMemberRow
              uid={member.uid}
              name={member.name}
              avatar={member.avatar}
              onRemove={toggle}
              removeLabel={tt("forwardModalLocal.remove")}
            />
          )}
        />
      </div>
    </BaseDialog>
  );
}
