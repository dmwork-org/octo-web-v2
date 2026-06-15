import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { ConfirmDialog } from "@/features/base/components/overlay/confirm-dialog";
import {
  deleteSecret,
  listSecrets,
  type SecretKind,
  type SecretListItem,
} from "@/features/base/api/endpoints/secrets.api";
import { SecretEditModal } from "@/features/base/components/secrets/secret-edit-modal";
import { formatRelativeFromNow } from "@/features/base/components/secrets/relative-time";
import { useT } from "@/lib/i18n/use-t";
import { i18n } from "@/lib/i18n/instance";

interface SecretsSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialCreate?: boolean;
  prefillName?: string;
  prefillValue?: string;
  prefillKind?: SecretKind;
}

type EditTarget =
  | { mode: "create"; prefillName?: string; prefillValue?: string; prefillKind?: SecretKind }
  | { mode: "edit"; secret: SecretListItem }
  | null;

const secretsQueryKey = ["secrets", "list"] as const;

export function SecretsSettingsModal({
  open,
  onClose,
  initialCreate,
  prefillName,
  prefillValue,
  prefillKind,
}: SecretsSettingsModalProps) {
  const t = useT();
  const [editTarget, setEditTarget] = useState<EditTarget>(
    initialCreate ? { mode: "create", prefillName, prefillValue, prefillKind } : null,
  );
  const [deleteTarget, setDeleteTarget] = useState<SecretListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const query = useQuery({
    queryKey: secretsQueryKey,
    queryFn: listSecrets,
    enabled: open,
  });

  const items = query.data ?? [];

  const startCreate = () => setEditTarget({ mode: "create" });

  const refresh = () => {
    void query.refetch();
  };

  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      toast.success(t("base.secrets.toast.nameCopied"));
    } catch {
      toast.error(t("base.secrets.error.copyFailed"));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSecret(deleteTarget.secret_id);
      toast.success(t("base.secrets.toast.deleted"));
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      const msg = (err as { message?: string }).message;
      toast.error(msg ?? t("base.secrets.error.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const renderMeta = (secret: SecretListItem) => {
    const created = t("base.secrets.meta.created", {
      values: { time: i18n.format.date(secret.created_at) },
    });
    const lastUsed = secret.last_used_at
      ? t("base.secrets.meta.lastUsed", {
          values: { time: formatRelativeFromNow(secret.last_used_at, i18n.format) },
        })
      : t("base.secrets.meta.neverUsed");
    return `${created} · ${lastUsed}`;
  };

  return (
    <>
      <BaseDialog
        open={open}
        onOpenChange={(next) => !next && onClose()}
        size="lg"
        height="auto"
        title={t("base.secrets.title")}
        className="w-[min(720px,calc(100vw-32px))]"
        contentClassName="overflow-hidden"
      >
        <div className="flex min-h-0 flex-1 flex-col bg-bg-surface">
          <header className="flex shrink-0 items-start justify-between gap-4 px-6 pt-4 pb-3">
            <p className="min-w-0 max-w-[460px] text-[14px] leading-6 text-text-secondary">
              {t("base.secrets.subtitle")}
            </p>
            <Button
              type="primary"
              theme="solid"
              onClick={startCreate}
              className="h-9 shrink-0 gap-2 rounded-lg bg-[#1f2028] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2b34]"
            >
              <Plus size={18} strokeWidth={2.5} />
              {t("base.secrets.addButton")}
            </Button>
          </header>

          {query.isLoading ? (
            <div className="flex flex-1 items-center justify-center py-12 text-sm text-text-tertiary">
              {t("base.common.loading")}
            </div>
          ) : query.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-sm text-text-tertiary">
              <span>{t("base.secrets.error.loadFailed")}</span>
              <Button type="secondary" theme="light" onClick={refresh}>
                {t("base.secrets.retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[340px] flex-col items-center justify-center px-8 pt-8 pb-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8e8eb] text-[#20212a]">
                <KeyRound size={28} strokeWidth={3} />
              </div>
              <p className="mt-5 max-w-[440px] text-[15px] leading-7 text-text-secondary">
                {t("base.secrets.empty")}
              </p>
              <Button
                type="primary"
                theme="solid"
                onClick={startCreate}
                className="mt-5 h-10 gap-2 rounded-lg bg-[#1f2028] px-5 text-[15px] font-semibold text-white hover:bg-[#2a2b34]"
              >
                <Plus size={18} strokeWidth={2.5} />
                {t("base.secrets.empty.action")}
              </Button>
            </div>
          ) : (
            <ul className="max-h-[58vh] min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {items.map((secret) => (
                <li
                  key={secret.secret_id}
                  className="mb-3 flex gap-4 rounded-lg border border-border-subtle bg-bg-base p-4 transition-colors hover:bg-bg-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-[#20212a]">
                        {secret.display_name}
                      </span>
                      <span
                        className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${
                          secret.kind === "llm"
                            ? "bg-brand-tint text-brand"
                            : "bg-bg-elevated text-text-secondary"
                        }`}
                      >
                        {secret.kind === "llm"
                          ? t("base.secrets.kind.llm")
                          : t("base.secrets.kind.external")}
                      </span>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                      <code className="rounded-sm bg-bg-elevated px-2 py-1 text-xs text-text-secondary">
                        {secret.masked}
                      </code>
                      <button
                        type="button"
                        onClick={() => void handleCopyName(secret.display_name)}
                        className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-brand transition-colors hover:bg-brand-tint"
                      >
                        <Copy size={13} />
                        {t("base.secrets.action.copyName")}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-text-tertiary">{renderMeta(secret)}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <IconButton
                      label={t("base.secrets.action.edit")}
                      onClick={() => setEditTarget({ mode: "edit", secret })}
                    >
                      <Pencil size={15} />
                    </IconButton>
                    <IconButton
                      label={t("base.secrets.action.updateKey")}
                      onClick={() => setEditTarget({ mode: "edit", secret })}
                    >
                      <RefreshCw size={15} />
                    </IconButton>
                    <IconButton
                      danger
                      label={t("base.secrets.action.delete")}
                      onClick={() => setDeleteTarget(secret)}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BaseDialog>

      {editTarget ? (
        <SecretEditModal
          open
          secret={editTarget.mode === "edit" ? editTarget.secret : undefined}
          existing={items}
          prefillName={editTarget.mode === "create" ? editTarget.prefillName : undefined}
          prefillValue={editTarget.mode === "create" ? editTarget.prefillValue : undefined}
          prefillKind={editTarget.mode === "create" ? editTarget.prefillKind : undefined}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
        title={t("base.secrets.delete.title")}
        content={
          deleteTarget
            ? t("base.secrets.delete.content", {
                values: { name: deleteTarget.display_name },
              })
            : ""
        }
        okText={t("base.secrets.delete.confirm")}
        okDanger
        okLoading={deleting}
        onOk={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        danger
          ? "text-text-tertiary hover:bg-error/10 hover:text-error"
          : "text-text-tertiary hover:bg-bg-elevated hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
