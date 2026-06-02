import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { authStore } from "@/features/base/stores/auth";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import { createMatter, extractMatter, updateMatter } from "@/features/matter/api/matter.api";
import type {
  ExtractMatterReq,
  ExtractMessage,
  ExtractResult,
} from "@/features/matter/types/matter.types";

interface SmartCreateModalProps {
  open: boolean;
  channel: Channel;
  channelName?: string;
  messages: Message[];
  /** composer 工具栏 ✓ / Alt+Enter 触发时可预填 title。 */
  prefillTitle?: string;
  /** 预选负责人(@提及人时触发)。 */
  prefillAssigneeUids?: string[];
  onClose: () => void;
}

function toExtractMsgs(msgs: Message[]): ExtractMessage[] {
  return msgs.map((m) => {
    const info = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(m.fromUID, ChannelTypePerson),
    );
    return {
      message_id: m.messageID,
      from_uid: m.fromUID,
      from_uname: info?.title,
      timestamp: m.timestamp,
      content: m.content?.conversationDigest ?? "",
    };
  });
}

/** YYYY-MM-DD + 本地 23:59:59 + 时区偏移 → 后端 deadline ISO 串(对齐旧 toLocalDateString)。 */
function buildDeadlineISO(dateStr: string): string {
  const off = new Date().getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${dateStr}T23:59:59${sign}${hh}:${mm}`;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 智能创建事项 modal — 1:1 对齐旧 dmworktodo CreateTaskModal + SmartCreateModal。
 *
 * 两种触发路径:
 *
 * - **selection-toolbar "创建新事项"**(messages 非空):
 *   AI 抽取 → 标题/主要目标自动填,用户编辑后保存。
 *
 * - **composer ✓ / Alt+Enter**(messages 空,对齐 CreateTaskModal):
 *   手动 4 字段表单(全必填):
 *     ① 事项名称(200 字)
 *     ② 主要目标(200 字 + 计数)
 *     ③ 负责人(多选,候选 = space 成员 ∖ self ∖ robot)
 *     ④ Deadline(date,today+)
 *   ESC 关 / title 上 Enter 提交 / textarea 内 Enter 走默认。
 */
export function SmartCreateModal({
  open,
  channel,
  channelName,
  messages,
  prefillTitle = "",
  prefillAssigneeUids = [],
  onClose,
}: SmartCreateModalProps) {
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const isManual = messages.length === 0;

  const [draft, setDraft] = useState<ExtractResult | null>(null);
  const [title, setTitle] = useState(prefillTitle);
  const [description, setDescription] = useState("");
  const [assigneeUids, setAssigneeUids] = useState<string[]>(prefillAssigneeUids);
  const [deadline, setDeadline] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  useResetOnOpen(open, isManual, prefillTitle, prefillAssigneeUids, {
    setTitle,
    setDescription,
    setAssigneeUids,
    setDeadline,
    titleRef,
  });

  const extractMu = useMutation({
    mutationFn: async (): Promise<ExtractResult> => {
      const req: ExtractMatterReq = {
        channel_type: channel.channelType,
        channel_id: channel.channelID,
        channel_name: channelName,
        creator_uid: myUid,
        msgs: toExtractMsgs(messages),
      };
      return extractMatter(req);
    },
    onSuccess: (result) => setDraft(result),
    onError: (err) => toast.error(err instanceof Error ? err.message : "AI 抽取失败"),
  });
  useTriggerExtract(open && !isManual, !!draft, extractMu.mutate);

  const saveMu = useMutation({
    mutationFn: async () => {
      if (isManual) {
        await createMatter({
          title: title.trim(),
          description: description.trim() || undefined,
          assignee_ids: assigneeUids.length > 0 ? assigneeUids : undefined,
          deadline: deadline ? buildDeadlineISO(deadline) : undefined,
          source_channel_id: channel.channelID,
          source_channel_type: channel.channelType,
          source_name: channelName,
        });
        return;
      }
      if (!draft) return;
      await updateMatter(draft.id, {
        title: draft.title,
        description: draft.description ?? null,
        deadline: draft.deadline ? new Date(draft.deadline).toISOString() : null,
      });
    },
    onSuccess: () => {
      toast.success(isManual ? "事项已创建" : "已保存事项");
      setDraft(null);
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "保存失败"),
  });

  if (!open) return null;
  const isExtracting = !isManual && extractMu.isPending && !draft;
  const isValid = isManual
    ? title.trim() && description.trim() && assigneeUids.length > 0 && !!deadline
    : !!draft;
  const today = todayDateStr();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT" && e.target !== titleRef.current) return;
      e.preventDefault();
      if (isValid && !saveMu.isPending) saveMu.mutate();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={onKeyDown}
    >
      <div className="flex w-[480px] max-w-full flex-col overflow-hidden rounded-lg bg-bg-surface shadow-xl ring-1 ring-brand/10">
        {/* Header */}
        <header className="flex items-center justify-between p-4">
          <h3 className="m-0 text-base font-semibold text-text-strong">
            {isManual ? "新建事项:" : `AI 智能创建事项 (${messages.length} 条消息)`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        {/* Content */}
        <div className="flex flex-col gap-4 px-4 py-[10px]">
          {isManual ? (
            <ManualFields
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              assigneeUids={assigneeUids}
              setAssigneeUids={setAssigneeUids}
              deadline={deadline}
              setDeadline={setDeadline}
              today={today}
              myUid={myUid}
              channel={channel}
              titleRef={titleRef}
            />
          ) : isExtracting ? (
            <div className="flex h-32 items-center justify-center text-sm text-text-tertiary">
              AI 正在抽取事项...
            </div>
          ) : extractMu.error ? (
            <div className="flex h-32 flex-col items-center justify-center gap-3">
              <span className="text-sm text-error">
                {extractMu.error instanceof Error ? extractMu.error.message : "AI 抽取失败"}
              </span>
              <Button onClick={() => extractMu.mutate()}>重试</Button>
            </div>
          ) : draft ? (
            <ExtractDraftFields draft={draft} setDraft={setDraft} />
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 items-center rounded-full border border-brand/10 bg-bg-surface px-3 text-[13px] font-semibold text-text-strong transition-colors hover:bg-bg-hover"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => saveMu.mutate()}
            disabled={!isValid || saveMu.isPending}
            className="inline-flex h-7 items-center rounded-full bg-brand px-3 text-[13px] font-semibold text-text-inverse transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveMu.isPending ? "保存中..." : isManual ? "确定" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manual 4 字段表单 ─────────────────────────────────────────

interface ManualFieldsProps {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  assigneeUids: string[];
  setAssigneeUids: (v: string[]) => void;
  deadline: string;
  setDeadline: (v: string) => void;
  today: string;
  myUid: string;
  channel: Channel;
  titleRef: React.RefObject<HTMLInputElement | null>;
}

function ManualFields({
  title,
  setTitle,
  description,
  setDescription,
  assigneeUids,
  setAssigneeUids,
  deadline,
  setDeadline,
  today,
  myUid,
  channel,
  titleRef,
}: ManualFieldsProps) {
  return (
    <>
      <Field label="事项名称" required>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="请输入"
          maxLength={200}
          className="h-8 w-full rounded-sm border-0 bg-brand/[0.04] px-3 text-sm leading-5 text-text-primary placeholder:text-brand/30 focus:bg-brand/[0.06] focus:outline-none"
        />
      </Field>

      <Field label="主要目标" required>
        <div className="relative">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
            placeholder="一句话说清这件事"
            rows={3}
            maxLength={200}
            className="block h-[75px] w-full resize-none rounded-sm border-0 bg-brand/[0.04] px-3 pt-1.5 pb-5 font-sans text-sm leading-5 text-text-primary placeholder:text-brand/30 focus:bg-brand/[0.06] focus:outline-none"
          />
          <span className="pointer-events-none absolute right-3 bottom-1.5 text-xs leading-4 text-text-tertiary">
            {description.length}/200
          </span>
        </div>
      </Field>

      <Field label="负责人" required>
        <AssigneeMultiSelect
          value={assigneeUids}
          onChange={setAssigneeUids}
          myUid={myUid}
          channel={channel}
        />
      </Field>

      <Field label="Deadline" required>
        <input
          type="date"
          value={deadline}
          min={today}
          onChange={(e) => setDeadline(e.target.value)}
          className="h-8 w-full rounded-sm border-0 bg-brand/[0.04] px-3 text-sm text-text-primary focus:bg-brand/[0.06] focus:outline-none"
        />
      </Field>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm leading-5 font-semibold text-text-strong">
        {label}
        {required ? <span className="ml-0.5 text-error">*</span> : null}
      </label>
      {children}
    </div>
  );
}

// ─── 负责人多选 picker(controlled) ───────────────────────────

interface AssigneeMultiSelectProps {
  value: string[];
  onChange: (v: string[]) => void;
  myUid: string;
  channel: Channel;
}

interface MemberOption {
  uid: string;
  name: string;
  isBot: boolean;
}

function AssigneeMultiSelect({ value, onChange, myUid, channel }: AssigneeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false));

  // 对齐旧 useMemberList:有 channel 用群成员(子区取父群),不过滤 bot 让用户可选(UI 加 AI badge)
  const subscribers = useGroupSubscribers(channel, true);
  const candidates = useMemo<MemberOption[]>(
    () =>
      subscribers
        .filter((s) => s.uid !== myUid && !s.isDeleted)
        .map((s) => {
          const og = s.orgData as { robot?: number } | undefined;
          return {
            uid: s.uid,
            name: s.remark || s.name || s.uid,
            isBot: og?.robot === 1,
          };
        }),
    [subscribers, myUid],
  );
  const valueSet = useMemo(() => new Set(value), [value]);
  const selectedMembers = useMemo(
    () => candidates.filter((m) => valueSet.has(m.uid)),
    [candidates, valueSet],
  );

  const toggle = (uid: string) => {
    const next = new Set(value);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChange([...next]);
  };

  const remove = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((u) => u !== uid));
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-8 w-full items-center gap-1.5 rounded-sm border-0 bg-brand/[0.04] px-2 py-1 text-left text-sm text-text-primary transition-colors hover:bg-brand/[0.06] ${open ? "bg-brand/[0.06]" : ""}`}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selectedMembers.length === 0 ? (
            <span className="text-brand/30">请选择</span>
          ) : (
            selectedMembers.map((m) => (
              <span
                key={m.uid}
                className="inline-flex items-center gap-1 rounded bg-bg-elevated px-1.5 py-0.5 text-xs"
              >
                {m.name}
                <button
                  type="button"
                  onClick={(e) => remove(m.uid, e)}
                  className="flex h-3 w-3 items-center justify-center text-text-tertiary hover:text-text-primary"
                >
                  <X size={10} />
                </button>
              </span>
            ))
          )}
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-[240px] overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
          {candidates.length === 0 ? (
            <div className="px-3 py-2 text-center text-xs text-text-tertiary">无可选成员</div>
          ) : (
            candidates.map((m) => {
              const checked = valueSet.has(m.uid);
              return (
                <button
                  key={m.uid}
                  type="button"
                  onClick={() => toggle(m.uid)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-bg-hover ${checked ? "bg-brand-tint/40" : ""}`}
                >
                  <ChannelAvatar
                    channel={new Channel(m.uid, ChannelTypePerson)}
                    size={20}
                    title={m.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-text-primary">{m.name}</span>
                  {m.isBot ? <AiBadge size="small" /> : null}
                  {checked ? (
                    <span className="ml-1 text-xs font-semibold text-brand">✓</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── extract 路径 draft 编辑(原 SmartCreateModal 行为) ───────────

function ExtractDraftFields({
  draft,
  setDraft,
}: {
  draft: ExtractResult;
  setDraft: (d: ExtractResult) => void;
}) {
  return (
    <>
      <Field label="标题">
        <input
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className="h-8 w-full rounded-sm border-0 bg-brand/[0.04] px-3 text-sm text-text-primary focus:bg-brand/[0.06] focus:outline-none"
        />
      </Field>
      <Field label="主要目标">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={5}
          className="block h-[75px] w-full resize-none rounded-sm border-0 bg-brand/[0.04] px-3 py-1.5 font-sans text-sm leading-5 text-text-primary focus:bg-brand/[0.06] focus:outline-none"
        />
      </Field>
      <div className="text-[11px] text-text-tertiary">
        #{draft.seq_no} · 由 AI 从 {draft.source_msgs.length} 条消息抽取
      </div>
    </>
  );
}

// ─── 命名 hook(满足 no-useeffect-in-component) ─────────────────────

function useTriggerExtract(shouldRun: boolean, hasDraft: boolean, trigger: () => void): void {
  useEffect(() => {
    if (shouldRun && !hasDraft) trigger();
  }, [shouldRun, hasDraft, trigger]);
}

interface ResetOpts {
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setAssigneeUids: (v: string[]) => void;
  setDeadline: (v: string) => void;
  titleRef: React.RefObject<HTMLInputElement | null>;
}

function useResetOnOpen(
  open: boolean,
  isManual: boolean,
  prefillTitle: string,
  prefillAssigneeUids: string[],
  opts: ResetOpts,
): void {
  const prefillKey = prefillAssigneeUids.join(",");
  useEffect(() => {
    if (!open) return;
    if (isManual) {
      opts.setTitle(prefillTitle.slice(0, 200));
      opts.setDescription("");
      opts.setAssigneeUids(prefillAssigneeUids);
      opts.setDeadline("");
      const t = setTimeout(() => opts.titleRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isManual, prefillTitle, prefillKey]);
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void): void {
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ref, handler]);
}
