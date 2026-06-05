import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { Search, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";
import { createGroup } from "@/features/base/api/endpoints/group.api";
import { moveGroupToCategory } from "@/features/base/api/endpoints/follow.api";

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
 * 发起群聊弹层(对应旧 dmworkbase OrganizationalGroupNew action=createGroup):
 *
 * - 候选 = spaceMembers - 自己(robot 也允许选;后端按需过滤)
 * - 搜索过滤 / 多选
 * - 提交 POST /v1/groups { members: [myUid, ...selected], space_id }
 * - 成功后:
 *   - invalidate conversations
 *   - fetchChannelInfo(为新群拉一遍信息,渲染头像/名字)
 *   - chatSelectedActions.select(newChannel) — 直接切到新群
 *   - **若指定 categoryId**:追加 moveGroupToCategory 把新群加到指定分组(失败静默,
 *     用户可手动拖)
 *   - 关闭 modal
 *
 * 至少选 1 人才能提交(2 人群:自己 + 1 人 = DM-like;后端按 members.length 决定);
 * 旧版下限同样是 1。
 */
export function CreateGroupModal({ open, onClose, categoryId }: CreateGroupModalProps) {
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
      // 若指定 categoryId — 追加 move 到分组(失败静默,不阻塞主流程)
      if (categoryId) {
        try {
          await moveGroupToCategory(resp.group_no, categoryId);
          void qc.invalidateQueries({ queryKey: ["chat", "follow", "categories"] });
          void qc.invalidateQueries({ queryKey: ["chat", "follow", "sidebar"] });
        } catch {
          // 静默 — 用户可手动拖到分组
        }
      }
      void qc.invalidateQueries({ queryKey: ["chat", "conversations"] });
      chatSelectedActions.select(newChannel);
      toast.success("群聊创建成功");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "创建失败"),
  });

  if (!open) return null;

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            发起群聊{selected.size > 0 ? `(${selected.size})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        <div className="shrink-0 px-5 py-2">
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5">
            <Search size={14} className="shrink-0 text-text-tertiary" />
            <input
              autoFocus
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索 Space 成员"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <ul className="flex flex-1 flex-col overflow-y-auto py-1">
          {isLoading ? (
            <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              加载中…
            </li>
          ) : filtered.length === 0 ? (
            <li className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {keyword ? "没有匹配的成员" : "Space 内没有其他成员"}
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

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            取消
          </Button>
          <Button
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={selected.size === 0}
            onClick={() => mu.mutate()}
          >
            创建{selected.size > 0 ? `(${selected.size + 1} 人)` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
