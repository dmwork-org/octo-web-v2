import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { spaceMembersQueryOptions } from "@/features/contacts/queries/directory.query";

interface ParticipantPickerProps {
  /** 已选 participant uid 列表 */
  value: string[];
  onChange: (uids: string[]) => void;
}

/** modal open 翻转时把 ext selected 同步进 internal pickerSelected */
function useResetPickerOnOpen(
  open: boolean,
  value: string[],
  setSelected: (s: Set<string>) => void,
) {
  useEffect(() => {
    if (open) setSelected(new Set(value));
  }, [open, value, setSelected]);
}

/**
 * 参与者多选(Wave 3c BY_PERSON 模式专用,内嵌于 SummaryCreateModal):
 *
 * - 触发按钮显示已选人数 + 头像缩略
 * - modal 打开后从 spaceMembers 列出真人(去 robot / 去自己)
 * - 保存时一次性 push 回父表单,不直接调 API
 *
 * 旧 dmworksummary ParticipantSelector + MemberSelectorModal 合二为一。
 */
export function ParticipantPicker({ value, onChange }: ParticipantPickerProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(value));
  useResetPickerOnOpen(open, value, setSelected);

  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { data: members } = useQuery({
    ...spaceMembersQueryOptions(spaceId),
    enabled: open && !!spaceId,
  });

  const candidates = useMemo(
    () => (members ?? []).filter((m) => m.uid !== myUid && m.robot !== 1),
    [members, myUid],
  );

  const valueSet = useMemo(() => new Set(value), [value]);
  const selectedMembers = useMemo(
    () => (members ?? []).filter((m) => valueSet.has(m.uid)),
    [members, valueSet],
  );

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const save = () => {
    onChange([...selected]);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-9 w-full items-center gap-2 rounded-md border border-border-default bg-bg-base px-3 py-1.5 text-left text-sm text-text-primary hover:border-brand"
      >
        {value.length === 0 ? (
          <span className="text-text-tertiary">点击选择参与者</span>
        ) : (
          <>
            <span className="flex shrink-0 -space-x-1">
              {selectedMembers.slice(0, 4).map((m) => (
                <ChannelAvatar
                  key={m.uid}
                  channel={new Channel(m.uid, ChannelTypePerson)}
                  size={20}
                  title={m.name}
                />
              ))}
              {selectedMembers.length === 0 && value.length > 0
                ? value
                    .slice(0, 4)
                    .map((uid) => (
                      <ChannelAvatar
                        key={uid}
                        channel={new Channel(uid, ChannelTypePerson)}
                        size={20}
                        title={uid}
                      />
                    ))
                : null}
            </span>
            <span className="truncate text-xs text-text-secondary">已选 {value.length} 人</span>
          </>
        )}
        <Pencil size={12} className="ml-auto shrink-0 text-text-tertiary" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
            <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
              <h2 className="text-sm font-semibold text-text-primary">选择参与者</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </header>
            <div className="shrink-0 px-5 pt-3 pb-2 text-xs text-text-tertiary">
              已选 {selected.size} 人
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto px-2 pb-2">
              {candidates.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-text-tertiary">
                  当前 Space 没有可选成员
                </div>
              ) : (
                candidates.map((m) => {
                  const checked = selected.has(m.uid);
                  const channel = new Channel(m.uid, ChannelTypePerson);
                  return (
                    <label
                      key={m.uid}
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
                      <ChannelAvatar channel={channel} size={32} title={m.name} />
                      <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                        {m.name || m.uid}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
              <Button type="tertiary" theme="borderless" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="primary" theme="solid" onClick={save}>
                确定
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
