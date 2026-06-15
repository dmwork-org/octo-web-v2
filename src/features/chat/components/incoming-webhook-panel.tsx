import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { type Channel } from "wukongimjssdk";
import {
  AlertTriangle,
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
import { toast } from "@/components/semi-bridge/toast";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { ConfirmModal } from "@/features/base/components/modals/confirm-modal";
import { Switch } from "@/features/base/components/section-form/toggle-row";
import { authStore } from "@/features/base/stores/auth";
import { endpointStore } from "@/features/base/stores/endpoint";
import {
  createIncomingWebhook,
  deleteIncomingWebhook,
  listIncomingWebhooks,
  regenerateIncomingWebhook,
  testIncomingWebhook,
  updateIncomingWebhook,
} from "@/features/base/api/endpoints/group.api";
import {
  buildWebhookCurlExample,
  buildWebhookUpsertReq,
  buildWebhookUrlRows,
  canManageIncomingWebhook,
  canTestWebhook,
  IncomingWebhookStatus,
  INCOMING_WEBHOOK_DEFAULT_AVATAR,
  type IncomingWebhook,
  type IncomingWebhookCreateResp,
  type WebhookUrlRow,
} from "@/features/chat/lib/incoming-webhook";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface IncomingWebhookPanelProps {
  open: boolean;
  channel: Channel;
  isManager: boolean;
  onClose: () => void;
}

const TEST_COOLDOWN_MS = 3000;

function webhookQueryKey(groupNo: string) {
  return ["chat", "incoming-webhooks", groupNo] as const;
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
  toast.error(err instanceof Error ? err.message : fallback);
}

function useTestCooldown() {
  const [coolingId, setCoolingId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  onClose,
}: IncomingWebhookPanelProps) {
  const tr = useT();
  const qc = useQueryClient();
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");
  const { coolingId, start: startCooldown } = useTestCooldown();
  const [editTarget, setEditTarget] = useState<
    { mode: "create" } | { mode: "edit"; webhook: IncomingWebhook } | null
  >(null);
  const [urlResult, setUrlResult] = useState<IncomingWebhookCreateResp | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IncomingWebhook | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState<IncomingWebhook | null>(null);

  const query = useQuery({
    queryKey: webhookQueryKey(channel.channelID),
    queryFn: () => listIncomingWebhooks(channel.channelID),
    enabled: open,
  });
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: webhookQueryKey(channel.channelID) });

  const toggleMu = useMutation({
    mutationFn: (args: { item: IncomingWebhook; enabled: boolean }) =>
      updateIncomingWebhook(channel.channelID, args.item.webhook_id, {
        status: args.enabled ? IncomingWebhookStatus.enabled : IncomingWebhookStatus.disabled,
      }),
    onSuccess: invalidate,
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.updateFailed")),
  });

  const testMu = useMutation({
    mutationFn: (item: IncomingWebhook) => testIncomingWebhook(channel.channelID, item.webhook_id),
    onSuccess: (_void, item) => {
      toast.success(t("channelWebhook.toast.testSent"));
      startCooldown(item.webhook_id);
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.testFailed")),
  });

  const deleteMu = useMutation({
    mutationFn: (item: IncomingWebhook) =>
      deleteIncomingWebhook(channel.channelID, item.webhook_id),
    onSuccess: () => {
      toast.success(t("channelWebhook.toast.deleted"));
      setConfirmDelete(null);
      invalidate();
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.deleteFailed")),
  });

  const regenerateMu = useMutation({
    mutationFn: (item: IncomingWebhook) =>
      regenerateIncomingWebhook(channel.channelID, item.webhook_id),
    onSuccess: (resp) => {
      setUrlResult(resp);
      setConfirmRegenerate(null);
      invalidate();
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.regenerateFailed")),
  });

  const items = query.data ?? [];

  return (
    <>
      <BaseDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        side="right"
        size="md"
        title={tr("channelWebhook.title")}
      >
        <div className="flex flex-1 flex-col overflow-y-auto py-2">
          <div className="mx-4 mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 text-[12px] leading-5 text-text-tertiary">
              {tr("channelWebhook.description")}
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
                          {tr("channelWebhook.meta.created", {
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
                              : tr("channelWebhook.action.testDisabled")
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
                        {!canTest ? (
                          <span className="ml-1 text-[11px] text-text-tertiary">
                            {tr("channelWebhook.disabledTestHint")}
                          </span>
                        ) : null}
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
        <ConfirmModal
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
        <ConfirmModal
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

function WebhookEditDialog({
  channel,
  isManager,
  webhook,
  onClose,
  onSaved,
}: {
  channel: Channel;
  isManager: boolean;
  webhook?: IncomingWebhook;
  onClose: () => void;
  onSaved: (created?: IncomingWebhookCreateResp) => void;
}) {
  const tr = useT();
  const [name, setName] = useState(webhook?.name ?? "");
  const [avatar, setAvatar] = useState(webhook?.avatar ?? "");
  const isEdit = !!webhook;
  const mu = useMutation({
    mutationFn: async () => {
      const req = buildWebhookUpsertReq({ isEdit, isManager, name, avatar, webhook });
      if (!req) return undefined;
      if (webhook) {
        await updateIncomingWebhook(channel.channelID, webhook.webhook_id, req);
        return undefined;
      }
      return createIncomingWebhook(channel.channelID, req);
    },
    onSuccess: (created) => {
      toast.success(isEdit ? t("channelWebhook.toast.updated") : t("channelWebhook.toast.created"));
      onSaved(created);
    },
    onError: (err) => displayWebhookError(err, t("channelWebhook.error.saveFailed")),
  });

  return (
    <BaseDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={isEdit ? tr("channelWebhook.editTitle") : tr("channelWebhook.createTitle")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {tr("common.cancel")}
          </Button>
          <Button type="primary" theme="solid" loading={mu.isPending} onClick={() => mu.mutate()}>
            {tr("base.common.save")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">
            {tr("channelWebhook.field.name")}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("channelWebhook.field.namePlaceholder")}
            maxLength={40}
            className="h-9 rounded-md border border-border-default bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </label>
        {isManager ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {tr("channelWebhook.field.avatar")}
            </span>
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder={tr("channelWebhook.field.avatarPlaceholder")}
              className="h-9 rounded-md border border-border-default bg-bg-base px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
        ) : null}
      </div>
    </BaseDialog>
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (!ok) {
      toast.error(t("channelWebhook.toast.copyFailed"));
      return;
    }
    toast.success(t("channelWebhook.toast.copied"));
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
            {rows.map((row) => (
              <WebhookExample key={row.key} row={row} copiedKey={copiedKey} onCopy={handleCopy} />
            ))}
          </>
        )}
      </div>
    </BaseDialog>
  );
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
          copied={copiedKey === feedbackKey}
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
  const sampleKey =
    row.key === "wecom"
      ? "channelWebhook.url.example.wecom.sample"
      : "channelWebhook.url.example.native.sample";
  const noteKey =
    row.key === "wecom"
      ? "channelWebhook.url.example.wecom.note"
      : "channelWebhook.url.example.native.note";
  const curl = buildWebhookCurlExample(row.key, row.url, tr(sampleKey));
  const copied = copiedKey === feedbackKey;
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
