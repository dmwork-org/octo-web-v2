import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Channel, type Subscriber } from "wukongimjssdk";
import {
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Copy,
  Edit3,
  Link,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import { Switch } from "@/features/base/components/section-form/toggle-row";
import { authStore } from "@/features/base/stores/auth";
import { endpointStore } from "@/features/base/stores/endpoint";
import { displayName } from "@/features/base/lib/display-name";
import { useGroupSubscribers } from "@/features/chat/hooks/use-group-subscribers.hook";
import {
  createIncomingWebhook,
  deleteIncomingWebhook,
  listIncomingWebhooks,
  regenerateIncomingWebhook,
  testIncomingWebhook,
  updateIncomingWebhook,
} from "@/features/base/api/endpoints/group.api";
import {
  buildWebhookAdapterExamples,
  buildWebhookCurlExample,
  buildWebhookUpsertReq,
  buildWebhookUrlRows,
  canManageIncomingWebhook,
  canTestWebhook,
  isFlagOn,
  IncomingWebhookStatus,
  INCOMING_WEBHOOK_DEFAULT_AVATAR,
  MENTION_UID_MAX_LENGTH,
  MENTION_UIDS_MAX,
  normalizeMentionUids,
  validateMentionUids,
  type IncomingWebhook,
  type IncomingWebhookAdapterAuth,
  type IncomingWebhookCreateResp,
  type IncomingWebhookUpsertReq,
  type WebhookAdapterExampleRow,
  type WebhookUrlRow,
} from "@/features/chat/lib/incoming-webhook";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface IncomingWebhookPanelProps {
  open: boolean;
  channel: Channel;
  isManager: boolean;
  title: string;
  threadShortId?: string;
  onClose: () => void;
}

const TEST_COOLDOWN_MS = 3000;

function webhookQueryKey(groupNo: string, threadShortId?: string) {
  return ["chat", "incoming-webhooks", groupNo, threadShortId ?? "group"] as const;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function formatDateTime(ts: number): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function displayWebhookError(err: unknown, fallback: string): void {
  message.error(err instanceof Error ? err.message : fallback);
}

function useTestCooldown() {
  const [coolingId, setCoolingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  const start = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCoolingId(id);
    timerRef.current = setTimeout(() => setCoolingId(null), TEST_COOLDOWN_MS);
  };
  return { coolingId, start };
}

export function IncomingWebhookPanel({
  open,
  channel,
  isManager,
  title,
  threadShortId,
  onClose,
}: IncomingWebhookPanelProps) {
  const tr = useT();
  const qc = useQueryClient();
  const authUser = useStore(authStore, (s) => s.user);
  const myUid = authUser?.uid ?? "";
  const subscribers = useGroupSubscribers(channel, open);
  const { coolingId, start: startCooldown } = useTestCooldown();
  const [editTarget, setEditTarget] = useState<
    { mode: "create" } | { mode: "edit"; webhook: IncomingWebhook } | null
  >(null);
  const [urlResult, setUrlResult] = useState<IncomingWebhookCreateResp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IncomingWebhook | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState<IncomingWebhook | null>(null);

  const query = useQuery({
    queryKey: webhookQueryKey(channel.channelID, threadShortId),
    queryFn: () => listIncomingWebhooks(channel.channelID, threadShortId),
    enabled: open,
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: webhookQueryKey(channel.channelID, threadShortId) });

  const toggleMu = useMutation({
    mutationFn: (args: { item: IncomingWebhook; enabled: boolean }) =>
      updateIncomingWebhook(
        channel.channelID,
        args.item.webhook_id,
        {
          status: args.enabled ? IncomingWebhookStatus.enabled : IncomingWebhookStatus.disabled,
        },
        threadShortId,
      ),
    onSuccess: invalidate,
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.updateFailed")),
  });

  const testMu = useMutation({
    mutationFn: (item: IncomingWebhook) =>
      testIncomingWebhook(channel.channelID, item.webhook_id, threadShortId),
    onSuccess: (_void, item) => {
      message.success(t("channelWebhook.toast.testSent"));
      startCooldown(item.webhook_id);
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.testFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: (item: IncomingWebhook) =>
      deleteIncomingWebhook(channel.channelID, item.webhook_id, threadShortId),
    onSuccess: () => {
      message.success(t("channelWebhook.toast.deleted"));
      setConfirmDelete(null);
      invalidate();
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.deleteFailed")),
  });

  const regenerateMu = useMutation({
    mutationFn: (item: IncomingWebhook) =>
      regenerateIncomingWebhook(channel.channelID, item.webhook_id, threadShortId),
    onSuccess: (resp) => {
      setUrlResult(resp);
      setConfirmRegenerate(null);
      invalidate();
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.regenerateFailed")),
  });

  const items = useMemo(() => (Array.isArray(query.data) ? query.data : []), [query.data]);
  const creatorNames = useMemo(() => {
    const wanted = new Set(items.map((item) => item.creator_uid).filter(Boolean));
    const names = new Map<string, string>();
    for (const sub of subscribers) {
      if (!sub.uid || !wanted.has(sub.uid)) continue;
      const name = displayNameOfSubscriber(sub);
      if (name) names.set(sub.uid, name);
    }
    if (myUid && wanted.has(myUid) && !names.has(myUid)) {
      names.set(myUid, authUser?.name || tr("channelWebhook.meta.me"));
    }
    return names;
  }, [authUser?.name, items, myUid, subscribers, tr]);

  return (
    <>
      <BaseDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side="right"
        size="md"
        title={title}
      >
        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          <div className="mx-4 mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[12px] leading-5 text-text-tertiary">
              {threadShortId
                ? tr("channelWebhook.threadScopeHint")
                : tr("channelWebhook.description")}
            </p>
            {items.length > 0 ? (
              <Button size="small" type="primary" onClick={() => setEditTarget({ mode: "create" })}>
                <span className="inline-flex items-center gap-1">
                  <Plus size={14} />
                  {tr("channelWebhook.add")}
                </span>
              </Button>
            ) : null}
          </div>

          {query.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {tr("channelWebhook.loading")}
            </div>
          ) : query.error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm">
              <span className="text-error">{tr("channelWebhook.error.loadFailed")}</span>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="text-text-accent hover:underline"
              >
                {tr("channelWebhook.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="mx-4 flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border-default bg-bg-base px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-bg-elevated text-text-tertiary">
                <Link size={20} />
              </span>
              <p className="text-sm text-text-tertiary">{tr("channelWebhook.empty")}</p>
              <Button type="primary" onClick={() => setEditTarget({ mode: "create" })}>
                <span className="inline-flex items-center gap-1">
                  <Plus size={15} />
                  {tr("channelWebhook.add")}
                </span>
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-2 px-4">
              {items.map((item) => {
                const manageable = canManageIncomingWebhook(item, { isManager, myUid });
                const enabled = item.status === IncomingWebhookStatus.enabled;
                const canTest = canTestWebhook(item);
                return (
                  <li
                    key={item.webhook_id}
                    className="rounded-md border border-border-subtle bg-bg-base p-3"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={item.avatar || INCOMING_WEBHOOK_DEFAULT_AVATAR}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text-primary">
                            {item.name}
                          </span>
                          {!enabled ? (
                            <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-tertiary">
                              {tr("channelWebhook.status.disabled")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[11px] leading-4 text-text-tertiary">
                          {creatorNames.has(item.creator_uid)
                            ? tr("channelWebhook.meta.createdBy", {
                                values: {
                                  name: creatorNames.get(item.creator_uid) ?? "",
                                  time: formatDateTime(item.created_at),
                                },
                              })
                            : tr("channelWebhook.meta.created", {
                                values: { time: formatDateTime(item.created_at) },
                              })}
                        </div>
                        {item.call_count > 0 ? (
                          <div className="text-[11px] leading-4 text-text-tertiary">
                            {tr("channelWebhook.meta.usage", {
                              values: {
                                count: item.call_count,
                                time: formatDateTime(item.last_used_at),
                              },
                            })}
                          </div>
                        ) : null}
                      </div>
                      {manageable ? (
                        <Switch
                          checked={enabled}
                          disabled={
                            toggleMu.isPending &&
                            toggleMu.variables?.item.webhook_id === item.webhook_id
                          }
                          onChange={(next) => toggleMu.mutate({ item, enabled: next })}
                        />
                      ) : null}
                    </div>
                    {manageable ? (
                      <div className="mt-3 flex items-center gap-1 border-t border-border-subtle pt-2">
                        <IconButton
                          label={tr("channelWebhook.action.edit")}
                          onClick={() => setEditTarget({ mode: "edit", webhook: item })}
                        >
                          <Edit3 size={14} />
                        </IconButton>
                        <IconButton
                          label={tr("channelWebhook.action.regenerate")}
                          onClick={() => setConfirmRegenerate(item)}
                        >
                          <RefreshCw size={14} />
                        </IconButton>
                        <IconButton
                          label={
                            canTest
                              ? tr("channelWebhook.action.test")
                              : tr("channelWebhook.action.testDisabledHint")
                          }
                          disabled={!canTest || testMu.isPending || coolingId === item.webhook_id}
                          onClick={() => testMu.mutate(item)}
                        >
                          <Send size={14} />
                        </IconButton>
                        <IconButton
                          label={tr("channelWebhook.action.delete")}
                          danger
                          onClick={() => setConfirmDelete(item)}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </BaseDrawer>

      {editTarget ? (
        <WebhookEditDialog
          channel={channel}
          isManager={isManager}
          threadShortId={threadShortId}
          subscribers={subscribers}
          authUserName={authUser?.name ?? ""}
          myUid={myUid}
          webhook={editTarget.mode === "edit" ? editTarget.webhook : undefined}
          onClose={() => setEditTarget(null)}
          onSaved={(created) => {
            setEditTarget(null);
            if (created) setUrlResult(created);
            invalidate();
          }}
        />
      ) : null}

      {urlResult ? <WebhookUrlDialog resp={urlResult} onClose={() => setUrlResult(null)} /> : null}

      {confirmDelete ? (
        <ConfirmDialog
          open
          title={tr("channelWebhook.delete.title")}
          content={tr("channelWebhook.delete.content", { values: { name: confirmDelete.name } })}
          okText={tr("channelWebhook.delete.confirm")}
          okDanger
          okLoading={deleteMu.isPending}
          onOk={() => deleteMu.mutate(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      {confirmRegenerate ? (
        <ConfirmDialog
          open
          title={tr("channelWebhook.regenerate.title")}
          content={tr("channelWebhook.regenerate.content", {
            values: { name: confirmRegenerate.name },
          })}
          okText={tr("channelWebhook.regenerate.confirm")}
          okDanger
          okLoading={regenerateMu.isPending}
          onOk={() => regenerateMu.mutate(confirmRegenerate)}
          onCancel={() => setConfirmRegenerate(null)}
        />
      ) : null}
    </>
  );
}

function IconButton({
  label,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-error hover:bg-error/10"
          : "text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

const WEBHOOK_NAME_MAX_LENGTH = 64;
const WEBHOOK_AVATAR_MAX_LENGTH = 255;

interface MentionMemberOption {
  uid: string;
  name: string;
  isBot: boolean;
}

function isBotSubscriber(sub: Subscriber): boolean {
  const org = (sub.orgData ?? {}) as { robot?: unknown };
  return isFlagOn(org.robot);
}

function buildMentionMemberOptions(opts: {
  subscribers: Subscriber[];
  mentionUids: string[];
  myUid: string;
  authUserName: string;
  meLabel: string;
}): MentionMemberOption[] {
  const seen = new Set<string>();
  const out: MentionMemberOption[] = [];
  for (const sub of opts.subscribers) {
    if (!sub.uid || seen.has(sub.uid)) continue;
    seen.add(sub.uid);
    out.push({
      uid: sub.uid,
      name: displayNameOfSubscriber(sub),
      isBot: isBotSubscriber(sub),
    });
  }
  if (opts.myUid && !seen.has(opts.myUid)) {
    seen.add(opts.myUid);
    out.push({
      uid: opts.myUid,
      name: opts.authUserName || opts.meLabel,
      isBot: false,
    });
  }
  for (const uid of normalizeMentionUids(opts.mentionUids)) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    out.push({ uid, name: uid, isBot: false });
  }
  return out;
}

function WebhookEditDialog({
  channel,
  isManager,
  threadShortId,
  subscribers,
  authUserName,
  myUid,
  webhook,
  onClose,
  onSaved,
}: {
  channel: Channel;
  isManager: boolean;
  threadShortId?: string;
  subscribers: Subscriber[];
  authUserName: string;
  myUid: string;
  webhook?: IncomingWebhook;
  onClose: () => void;
  onSaved: (created?: IncomingWebhookCreateResp) => void;
}) {
  const tr = useT();
  const [name, setName] = useState(webhook?.name ?? "");
  const [avatar, setAvatar] = useState(webhook?.avatar ?? "");
  const [mentionAll, setMentionAll] = useState(isFlagOn(webhook?.allow_mention_all));
  const [mentionBots, setMentionBots] = useState(isFlagOn(webhook?.allow_mention_bots));
  const [mentionUids, setMentionUids] = useState<string[]>(webhook?.mention_uids ?? []);
  const [mentionFilter, setMentionFilter] = useState("");
  const [nameComposing, setNameComposing] = useState(false);
  const isEdit = !!webhook;
  const memberOptions = useMemo(
    () =>
      buildMentionMemberOptions({
        subscribers,
        mentionUids,
        myUid,
        authUserName,
        meLabel: tr("channelWebhook.meta.me"),
      }),
    [authUserName, mentionUids, myUid, subscribers, tr],
  );
  const optionByUid = useMemo(
    () => new Map(memberOptions.map((item) => [item.uid, item])),
    [memberOptions],
  );
  const filteredMemberOptions = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    if (!q) return memberOptions;
    return memberOptions.filter(
      (item) => item.uid.toLowerCase().includes(q) || item.name.toLowerCase().includes(q),
    );
  }, [memberOptions, mentionFilter]);
  const selectedUids = normalizeMentionUids(mentionUids);
  const selectedSet = new Set(selectedUids);
  const aiOptionCount = memberOptions.filter((item) => item.isBot).length;

  const mu = useMutation({
    mutationFn: async (req: IncomingWebhookUpsertReq) => {
      if (webhook) {
        await updateIncomingWebhook(channel.channelID, webhook.webhook_id, req, threadShortId);
        return undefined;
      }
      return createIncomingWebhook(channel.channelID, req, threadShortId);
    },
    onSuccess: (created) => {
      message.success(
        isEdit ? t("channelWebhook.toast.updated") : t("channelWebhook.toast.created"),
      );
      onSaved(created);
    },
    onError: (err) =>
      displayWebhookError(
        err,
        t(isEdit ? "channelWebhook.error.updateFailed" : "channelWebhook.error.createFailed"),
      ),
  });

  const handleSave = () => {
    const mentionCheck = validateMentionUids(mentionUids);
    if (!mentionCheck.ok) {
      const isTooMany = mentionCheck.reason === "tooMany";
      message.error(
        t(
          isTooMany
            ? "channelWebhook.form.mentionUidsTooMany"
            : "channelWebhook.form.mentionUidsTooLong",
          { values: { max: isTooMany ? MENTION_UIDS_MAX : MENTION_UID_MAX_LENGTH } },
        ),
      );
      return;
    }
    const req = buildWebhookUpsertReq({
      isEdit,
      isManager,
      name,
      avatar,
      mentionAll,
      mentionBots,
      mentionUids: mentionCheck.uids,
      webhook,
    });
    if (!req) {
      onClose();
      return;
    }
    mu.mutate(req);
  };

  const toggleMentionUid = (uid: string) => {
    setMentionUids((prev) => {
      const normalized = normalizeMentionUids(prev);
      return normalized.includes(uid)
        ? normalized.filter((item) => item !== uid)
        : [...normalized, uid];
    });
  };

  return (
    <BaseDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={isEdit ? tr("channelWebhook.form.editTitle") : tr("channelWebhook.form.createTitle")}
      description={tr("channelWebhook.description")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tr("common.cancel")}
          </Button>
          <Button type="primary" theme="solid" loading={mu.isPending} onClick={handleSave}>
            {tr("base.common.save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">
            {tr("channelWebhook.form.name")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onCompositionStart={() => setNameComposing(true)}
            onCompositionEnd={() => setNameComposing(false)}
            onKeyDown={(e) => {
              if (nameComposing && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            placeholder={tr("channelWebhook.form.namePlaceholder")}
            maxLength={WEBHOOK_NAME_MAX_LENGTH}
            className="h-9 rounded-md border border-border-default bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
        {isManager ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {tr("channelWebhook.form.avatar")}
            </span>
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder={tr("channelWebhook.form.avatarPlaceholder")}
              maxLength={WEBHOOK_AVATAR_MAX_LENGTH}
              className="h-9 rounded-md border border-border-default bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <span className="text-xs text-text-tertiary">
              {tr("channelWebhook.form.avatarHint")}
            </span>
          </label>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-secondary">
              {tr("channelWebhook.form.mentionUids")}
              <span className="ml-1 font-normal text-text-tertiary">
                {tr("channelWebhook.form.optional")}
              </span>
            </span>
            <span className="text-[11px] text-text-tertiary">
              {tr("channelWebhook.form.mentionUidsCount", {
                values: { total: memberOptions.length, ai: aiOptionCount },
              })}
            </span>
          </div>
          <div className="rounded-md border border-border-default bg-bg-base">
            <div className="border-b border-border-subtle p-2">
              <input
                value={mentionFilter}
                onChange={(event) => setMentionFilter(event.target.value)}
                placeholder={tr("channelWebhook.form.mentionUidsPlaceholder")}
                className="h-8 w-full rounded-sm bg-bg-elevated px-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              {selectedUids.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedUids.map((uid) => {
                    const option = optionByUid.get(uid);
                    return (
                      <button
                        type="button"
                        key={uid}
                        onClick={() => toggleMentionUid(uid)}
                        className="inline-flex max-w-full items-center gap-1 rounded-sm bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-bg-hover"
                      >
                        <span className="truncate">{option?.name ?? uid}</span>
                        {option?.isBot ? <AiBadge size="small" /> : null}
                        <span className="text-text-tertiary">×</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="max-h-40 overflow-y-auto py-1">
              {filteredMemberOptions.length > 0 ? (
                filteredMemberOptions.map((item) => (
                  <button
                    type="button"
                    key={item.uid}
                    onClick={() => toggleMentionUid(item.uid)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-bg-hover"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                        selectedSet.has(item.uid)
                          ? "border-brand bg-brand text-white"
                          : "border-border-default"
                      }`}
                    >
                      {selectedSet.has(item.uid) ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">{item.name}</span>
                    {item.isBot ? <AiBadge size="small" /> : null}
                  </button>
                ))
              ) : (
                <div className="px-2 py-3 text-center text-xs text-text-tertiary">
                  {tr("channelWebhook.form.mentionUidsEmpty")}
                </div>
              )}
            </div>
          </div>
          <span className="text-xs text-text-tertiary">
            {tr("channelWebhook.form.mentionUidsHint", { values: { max: MENTION_UIDS_MAX } })}
          </span>
        </div>
        <div className="rounded-md border border-warning/20 bg-warning/10 p-3">
          <div className="mb-2 flex items-start gap-2 text-xs text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{tr("channelWebhook.form.broadcastNoiseHint")}</span>
          </div>
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text-secondary">
                {tr("channelWebhook.form.mentionBots")}
              </span>
              <span className="block text-xs text-text-tertiary">
                {tr("channelWebhook.form.mentionBotsHint")}
              </span>
            </span>
            <Switch checked={mentionBots} onChange={setMentionBots} />
          </label>
          <label className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block text-xs font-medium text-text-secondary">
                {tr("channelWebhook.form.mentionAll")}
              </span>
              <span className="block text-xs text-text-tertiary">
                {tr("channelWebhook.form.mentionAllHint")}
              </span>
            </span>
            <Switch checked={mentionAll} onChange={setMentionAll} />
          </label>
        </div>
      </div>
    </BaseDialog>
  );
}

function displayNameOfSubscriber(sub: Subscriber): string {
  const org = (sub.orgData ?? {}) as {
    displayName?: string;
    name?: string;
    real_name?: string;
    realname_verified?: boolean | number | string;
  };
  return (
    displayName({
      remark: sub.remark,
      name: sub.name || org.name || org.displayName,
      real_name: org.real_name,
      realname_verified: org.realname_verified,
    }) ||
    org.displayName ||
    sub.uid
  );
}

function WebhookUrlDialog({
  resp,
  onClose,
}: {
  resp: IncomingWebhookCreateResp;
  onClose: () => void;
}) {
  const tr = useT();
  const apiURL = useStore(endpointStore, (s) => s.baseURL);
  const rows = useMemo(
    () => buildWebhookUrlRows(resp, apiURL || "/", window.location.origin),
    [apiURL, resp],
  );
  const nativeRow = rows.find((row) => row.key === "native");
  const coreRows = rows.filter((row) => row.key === "native" || row.key === "wecom");
  const extraRows = rows.filter((row) => row.key !== "native" && row.key !== "wecom");
  const serverExtraExamples = useMemo(
    () =>
      buildWebhookAdapterExamples(resp, apiURL || "/", window.location.origin).filter(
        (row) => row.key !== "native" && row.key !== "wecom",
      ),
    [apiURL, resp],
  );
  const useServerExamples = serverExtraExamples.length > 0;
  const hasMore = useServerExamples || extraRows.length > 0;
  const moreNames = useServerExamples
    ? serverExtraExamples.map((example) => brandName(example.key, example.title, tr))
    : extraRows.map((row) => brandName(row.key, tr(row.labelKey), tr));
  const moreTeaser = moreNames.slice(0, 4).join(tr("channelWebhook.url.example.moreSep"));
  const moreLabel =
    moreNames.length > 4
      ? tr("channelWebhook.url.example.moreEtc", { values: { names: moreTeaser } })
      : moreTeaser;
  const [showMore, setShowMore] = useState(false);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (!ok) {
      message.error(t("channelWebhook.toast.copyFailed"));
      return;
    }
    message.success(t("channelWebhook.toast.copied"));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <BaseDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      closeOnMask={false}
      closeOnEsc={false}
      size="lg"
      title={tr("channelWebhook.url.title")}
      description={tr("channelWebhook.url.onceWarning")}
      footer={
        <div className="flex w-full justify-end">
          <Button type="primary" theme="solid" onClick={onClose}>
            {tr("channelWebhook.url.done")}
          </Button>
        </div>
      }
    >
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-5 py-4">
        {rows.length === 0 || !nativeRow ? (
          <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertTriangle size={16} />
            {tr("channelWebhook.url.empty")}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
              <AlertTriangle size={16} />
              {tr("channelWebhook.url.onceWarning")}
            </div>
            <UrlValueRow
              label={tr("channelWebhook.url.address")}
              value={nativeRow.url}
              copied={copiedKey === "url:native"}
              onCopy={() => void handleCopy(nativeRow.url, "url:native")}
            />
            <div className="text-xs font-semibold text-text-secondary">
              {tr("channelWebhook.url.example.title")}
            </div>
            {coreRows.map((row) => (
              <WebhookExample key={row.key} row={row} copiedKey={copiedKey} onCopy={handleCopy} />
            ))}
            {hasMore ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((prev) => !prev)}
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${showMore ? "rotate-180" : ""}`}
                  />
                  {showMore
                    ? tr("channelWebhook.url.example.less")
                    : tr("channelWebhook.url.example.more", { values: { names: moreLabel } })}
                </button>
                {showMore
                  ? useServerExamples
                    ? serverExtraExamples.map((example) => (
                        <ServerWebhookExample
                          key={example.key}
                          example={example}
                          token={resp.token}
                          copiedKey={copiedKey}
                          openSteps={!!openSteps[example.key]}
                          onToggleSteps={() =>
                            setOpenSteps((prev) => ({
                              ...prev,
                              [example.key]: !prev[example.key],
                            }))
                          }
                          onCopy={handleCopy}
                        />
                      ))
                    : extraRows.map((row) => (
                        <WebhookExample
                          key={row.key}
                          row={row}
                          copiedKey={copiedKey}
                          onCopy={handleCopy}
                        />
                      ))
                  : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </BaseDialog>
  );
}

function brandName(
  key: string,
  fallback: string,
  tr: (key: string, options?: { values?: Record<string, string | number> }) => string,
): string {
  if (["github", "gitlab", "feishu", "multica", "wecom"].includes(key)) {
    return tr(`channelWebhook.url.brand.${key}`);
  }
  return fallback;
}

function UrlValueRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const tr = useT();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-elevated px-2 py-1.5">
        <code className="min-w-0 flex-1 truncate text-xs text-text-primary">{value}</code>
        <button
          type="button"
          onClick={onCopy}
          aria-label={tr("channelWebhook.url.copy")}
          title={tr("channelWebhook.url.copy")}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
        >
          {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

function WebhookExample({
  row,
  copiedKey,
  onCopy,
}: {
  row: WebhookUrlRow;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => Promise<void>;
}) {
  const tr = useT();
  const feedbackKey = `example:${row.key}`;
  const copied = copiedKey === feedbackKey;
  if (row.key === "github") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-base p-3">
        <div className="text-xs font-medium text-text-secondary">{tr(row.labelKey)}</div>
        <p className="text-xs text-text-tertiary">
          {tr("channelWebhook.url.example.github.intro")}
        </p>
        <UrlValueRow
          label={tr("channelWebhook.url.address")}
          value={row.url}
          copied={copied}
          onCopy={() => void onCopy(row.url, feedbackKey)}
        />
        <ol className="list-decimal space-y-1 pl-4 text-xs text-text-tertiary">
          <li>{tr("channelWebhook.url.example.github.step1")}</li>
          <li>{tr("channelWebhook.url.example.github.step2")}</li>
          <li>{tr("channelWebhook.url.example.github.step3")}</li>
        </ol>
      </div>
    );
  }
  if (row.key !== "native" && row.key !== "wecom") {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-base p-3">
        <div className="text-xs font-medium text-text-secondary">{tr(row.labelKey)}</div>
        <UrlValueRow
          label={tr("channelWebhook.url.address")}
          value={row.url}
          copied={copied}
          onCopy={() => void onCopy(row.url, feedbackKey)}
        />
        <span className="text-xs text-text-tertiary">
          {tr(`channelWebhook.url.example.${row.key}.note`)}
        </span>
      </div>
    );
  }
  const sampleKey =
    row.key === "wecom"
      ? "channelWebhook.url.example.wecom.sample"
      : "channelWebhook.url.example.native.sample";
  const noteKey =
    row.key === "wecom"
      ? "channelWebhook.url.example.wecom.note"
      : "channelWebhook.url.example.native.note";
  const curl = buildWebhookCurlExample(row.key, row.url, tr(sampleKey));
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="text-xs font-medium text-text-secondary">{tr(row.labelKey)}</div>
      <pre className="overflow-x-auto rounded-md bg-bg-elevated p-2 text-xs text-text-primary">
        {curl}
      </pre>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-xs text-text-tertiary">{tr(noteKey)}</span>
        <Button size="small" type="tertiary" onClick={() => void onCopy(curl, feedbackKey)}>
          <span className="inline-flex items-center gap-1">
            {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            {copied ? tr("channelWebhook.toast.copied") : tr("channelWebhook.url.example.copy")}
          </span>
        </Button>
      </div>
    </div>
  );
}

function ServerWebhookExample({
  example,
  token,
  copiedKey,
  openSteps,
  onToggleSteps,
  onCopy,
}: {
  example: WebhookAdapterExampleRow;
  token: string;
  copiedKey: string | null;
  openSteps: boolean;
  onToggleSteps: () => void;
  onCopy: (text: string, key: string) => Promise<void>;
}) {
  const tr = useT();
  const feedbackKey = `example:${example.key}`;
  const tokenFeedbackKey = `authtoken:${example.key}`;
  const needsHeaderToken = example.auth.type === "url_token_and_header" && !!example.auth.header;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-base p-3">
      <div className="text-xs font-medium text-text-secondary">{example.title}</div>
      {example.description ? (
        <span className="text-xs text-text-tertiary">{example.description}</span>
      ) : null}
      <UrlValueRow
        label={tr("channelWebhook.url.address")}
        value={example.url}
        copied={copiedKey === feedbackKey}
        onCopy={() => void onCopy(example.url, feedbackKey)}
      />
      {example.steps.length > 0 ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 self-start text-xs text-text-secondary hover:text-text-primary"
            aria-expanded={openSteps}
            onClick={onToggleSteps}
          >
            <ChevronDown
              size={14}
              className={`transition-transform ${openSteps ? "rotate-180" : ""}`}
            />
            {tr("channelWebhook.url.example.stepsTitle")}
          </button>
          {openSteps ? (
            <ol className="list-decimal space-y-1 pl-4 text-xs text-text-tertiary">
              {example.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      {needsHeaderToken ? (
        <WebhookAuthTokenHint
          auth={example.auth}
          token={token}
          copied={copiedKey === tokenFeedbackKey}
          onCopy={() => void onCopy(token, tokenFeedbackKey)}
        />
      ) : null}
    </div>
  );
}

function WebhookAuthTokenHint({
  auth,
  token,
  copied,
  onCopy,
}: {
  auth: IncomingWebhookAdapterAuth;
  token: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const tr = useT();
  if (!auth.header || !token || auth.value_source !== "token") return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-text-tertiary">
        {tr("channelWebhook.url.example.auth.headerHint", {
          values: { header: auth.header },
        })}
      </span>
      <UrlValueRow label={auth.header} value={token} copied={copied} onCopy={onCopy} />
    </div>
  );
}
