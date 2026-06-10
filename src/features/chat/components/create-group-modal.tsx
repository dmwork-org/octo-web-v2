import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypePerson,
  ChannelTypeGroup,
  ConversationAction,
  type Conversation,
} from "wukongimjssdk";
import { Search } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { sidebarFollowQueryKey } from "@/features/chat/queries/sidebar.query";
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
    const kw = keyword.trim().toLowerCase();
    if (!kw) return candidates;
    return candidates.filter(
      (c) => (c.name || "").toLowerCase().includes(kw) || c.uid.toLowerCase().includes(kw),
    );
  }, [candidates, keyword]);

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
      // - **本地 SDK** conv.unread:用一次性 listener 等 SDK push add 完成后清,
      //   通过 notifyConversationListeners 让 useConversationsSync 写回 cache
      // - **sidebar query**:invalidate 强刷快照(关注 tab 不订阅 conversationListener)
      void clearConversationUnread({
        channelId: resp.group_no,
        channelType: ChannelTypeGroup,
        unread: 0,
      });
      const cm = WKSDK.shared().conversationManager;
      const tryClearLocal = (): boolean => {
        const conv = cm.findConversation(newChannel);
        if (!conv) return false;
        if (conv.unread > 0) {
          conv.unread = 0;
          cm.notifyConversationListeners(conv, ConversationAction.update);
        }
        return true;
      };
      if (!tryClearLocal()) {
        const listener = (c: Conversation) => {
          if (c.channel.isEqual(newChannel) && tryClearLocal()) {
            cm.removeConversationListener(listener);
          }
        };
        cm.addConversationListener(listener);
        // 10s 超时清理避免 listener 泄漏(SDK push 正常不会拖这么久)
        setTimeout(() => cm.removeConversationListener(listener), 10000);
      }
      void qc.invalidateQueries({ queryKey: sidebarFollowQueryKey(spaceId) });
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      chatSelectedActions.select(newChannel);
      toast.success(t("createGroup.toast.created"));
      onClose();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("createGroup.toast.failed")),
  });

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      height="sm"
      title={
        selected.size > 0
          ? tt("createGroup.titleWithCount", { values: { count: selected.size } })
          : tt("createGroup.title")
      }
      contentClassName="overflow-hidden"
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
      <div className="shrink-0 px-5 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
          <Search size={14} className="shrink-0 text-text-tertiary" />
          <input
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={tt("createGroup.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
        </div>
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
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-bg-hover ${
                    checked ? "bg-brand-tint" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(m.uid)}
                    className="shrink-0"
                  />
                  <ChannelAvatar
                    channel={new Channel(m.uid, ChannelTypePerson)}
                    size={32}
                    title={m.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {m.name || m.uid}
                  </span>
                </label>
              </li>
            );
          })
        )}
      </ul>
    </BaseDialog>
  );
}
