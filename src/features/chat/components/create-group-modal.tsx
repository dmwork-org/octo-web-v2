import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, {
  Channel,
  ChannelTypeGroup,
  ConversationAction,
  type Conversation,
} from "wukongimjssdk";
import { Palette, Search } from "lucide-react";
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
import {
  cleanGroupAvatarText,
  colorIndexForName,
  groupAvatarFallbackText,
  groupAvatarLines,
  GROUP_AVATAR_COLORS,
} from "@/features/chat/lib/group-avatar-preview";
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
  resetMeta: () => void,
) {
  const resetMetaRef = useRef(resetMeta);
  resetMetaRef.current = resetMeta;
  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setKeyword("");
      resetMetaRef.current();
    }
  }, [open, setSelected, setKeyword]);
}

function GroupAvatarPreview({
  name,
  avatarText,
  colorIndex,
  size = 48,
}: {
  name: string;
  avatarText: string;
  colorIndex?: number;
  size?: number;
}) {
  const effectiveText = cleanGroupAvatarText(avatarText) || groupAvatarFallbackText(name);
  const idx = colorIndex ?? colorIndexForName(name);
  const color = GROUP_AVATAR_COLORS[idx % GROUP_AVATAR_COLORS.length] ?? GROUP_AVATAR_COLORS[0];
  const lines = groupAvatarLines(effectiveText);
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border"
      style={{
        width: size,
        height: size,
        background: color.fill,
        borderColor: color.main,
      }}
    >
      {effectiveText ? (
        <span
          className="flex flex-col items-center justify-center font-semibold leading-none"
          style={{ color: color.main, fontSize: lines.length > 1 ? size * 0.28 : size * 0.36 }}
        >
          {lines.map((line, index) => (
            <span key={index}>{line}</span>
          ))}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} aria-hidden="true">
          <g fill={color.iconBack}>
            <circle cx="15.5" cy="8.2" r="3.1" />
            <path d="M15.5 12.2c-3 0-5.4 1.9-6 4.4-.2.8.4 1.6 1.3 1.6h9.4c.9 0 1.5-.8 1.3-1.6-.6-2.5-3-4.4-6-4.4Z" />
          </g>
          <g fill={color.main}>
            <circle cx="9" cy="8.8" r="3.4" />
            <path d="M9 13c-3.3 0-6 2.1-6.6 4.9-.2.9.5 1.7 1.4 1.7h10.4c.9 0 1.6-.8 1.4-1.7C15 15.1 12.3 13 9 13Z" />
          </g>
        </svg>
      )}
    </div>
  );
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
  const [groupName, setGroupName] = useState("");
  const [avatarText, setAvatarText] = useState("");
  const [avatarColorIndex, setAvatarColorIndex] = useState<number | undefined>();
  const [avatarEditOpen, setAvatarEditOpen] = useState(false);
  useResetOnOpen(open, setSelected, setKeyword, () => {
    setGroupName("");
    setAvatarText("");
    setAvatarColorIndex(undefined);
    setAvatarEditOpen(false);
  });

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
      const name = groupName.trim();
      if (!name) {
        return Promise.reject(new Error(t("createGroup.nameRequired")));
      }
      const uids = [myUid, ...selected];
      return createGroup({
        members: uids,
        space_id: spaceId || undefined,
        name,
        avatar_text: cleanGroupAvatarText(avatarText) || undefined,
        avatar_color: avatarColorIndex,
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
      className="h-[620px] w-[665px]"
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
            disabled={selected.size === 0 || !groupName.trim()}
            onClick={() => {
              if (!groupName.trim()) {
                message.warning(t("createGroup.nameRequired"));
                return;
              }
              mu.mutate();
            }}
          >
            {selected.size > 0
              ? tt("createGroup.createWithCount", { values: { count: selected.size + 1 } })
              : tt("createGroup.create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={() => setAvatarEditOpen(true)}
            className="relative rounded-md focus:outline-none focus:ring-2 focus:ring-brand/35"
            aria-label={tt("createGroup.avatarEdit")}
          >
            <GroupAvatarPreview
              name={groupName}
              avatarText={avatarText}
              colorIndex={avatarColorIndex}
            />
            <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-surface text-text-secondary shadow">
              <Palette size={12} />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs text-text-tertiary">
              {tt("createGroup.name")}
            </label>
            <input
              value={groupName}
              maxLength={20}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={tt("createGroup.namePlaceholder")}
              className="h-9 w-full rounded-md border border-border-subtle bg-bg-base px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </div>
        </div>
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
      </div>
      <BaseDialog
        open={avatarEditOpen}
        onOpenChange={(next) => setAvatarEditOpen(next)}
        size="sm"
        title={tt("createGroup.avatarEdit")}
        footer={
          <Button type="primary" theme="solid" onClick={() => setAvatarEditOpen(false)}>
            {tt("base.common.confirm")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex justify-center">
            <GroupAvatarPreview
              name={groupName}
              avatarText={avatarText}
              colorIndex={avatarColorIndex}
              size={64}
            />
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">{tt("createGroup.avatarText")}</span>
            <input
              value={avatarText}
              onChange={(e) => setAvatarText(cleanGroupAvatarText(e.target.value))}
              placeholder={tt("createGroup.avatarTextPlaceholder")}
              className="h-9 rounded-md border border-border-subtle bg-bg-base px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">{tt("createGroup.avatarColor")}</span>
            <div className="flex flex-wrap gap-2">
              {GROUP_AVATAR_COLORS.map((color, index) => (
                <button
                  key={color.main}
                  type="button"
                  aria-label={`avatar-color-${index}`}
                  onClick={() => setAvatarColorIndex(index)}
                  className={`h-7 w-7 rounded-full border-2 ${avatarColorIndex === index ? "border-text-primary" : "border-transparent"}`}
                  style={{ background: color.fill, boxShadow: `inset 0 0 0 6px ${color.main}` }}
                />
              ))}
            </div>
          </div>
        </div>
      </BaseDialog>
    </BaseDialog>
  );
}
