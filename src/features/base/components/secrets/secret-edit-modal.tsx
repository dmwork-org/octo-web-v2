import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import {
  createSecret,
  normalizeSecretName,
  updateSecret,
  type SecretKind,
  type SecretListItem,
} from "@/features/base/api/endpoints/secrets.api";
import { useT } from "@/lib/i18n/use-t";

interface SecretEditModalProps {
  open: boolean;
  secret?: SecretListItem;
  existing: SecretListItem[];
  prefillName?: string;
  prefillValue?: string;
  prefillKind?: SecretKind;
  onClose: () => void;
  onSaved: () => void;
}

function isDuplicateError(err: unknown): boolean {
  const e = err as { status?: number; statusCode?: number; data?: { code?: string } };
  const code = e.data?.code ?? "";
  return e.status === 409 || e.statusCode === 409 || code.includes("duplicate");
}

function errorMessage(err: unknown): string | null {
  const e = err as { data?: { message?: string; msg?: string }; message?: string };
  return e.data?.message ?? e.data?.msg ?? e.message ?? null;
}

function useFocusSecretNameOnOpen(open: boolean, inputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, inputRef]);
}

export function SecretEditModal({
  open,
  secret,
  existing,
  prefillName,
  prefillValue,
  prefillKind,
  onClose,
  onSaved,
}: SecretEditModalProps) {
  const t = useT();
  const isEdit = !!secret;
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(secret?.display_name ?? prefillName ?? "");
  const [kind, setKind] = useState<SecretKind>(secret?.kind ?? prefillKind ?? "llm");
  const [value, setValue] = useState(isEdit ? "" : (prefillValue ?? ""));
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusSecretNameOnOpen(open, inputRef);

  const duplicate = useMemo(() => {
    const normalized = normalizeSecretName(name);
    if (!normalized) return false;
    return existing.some(
      (item) =>
        item.secret_id !== secret?.secret_id &&
        normalizeSecretName(item.display_name) === normalized,
    );
  }, [existing, name, secret?.secret_id]);

  const nameValid = name.trim().length > 0 && !duplicate;
  const valueValid = isEdit || value.trim().length > 0;
  const canSubmit = nameValid && valueValid && !saving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (secret) {
        const body: { display_name?: string; kind?: SecretKind; key?: string } = {};
        if (name.trim() !== secret.display_name) body.display_name = name.trim();
        if (kind !== secret.kind) body.kind = kind;
        if (value.trim()) body.key = value.trim();
        await updateSecret(secret.secret_id, body);
        toast.success(t("base.secrets.toast.updated"));
      } else {
        await createSecret({ display_name: name.trim(), kind, key: value.trim() });
        toast.success(t("base.secrets.toast.created"));
      }
      onSaved();
      onClose();
    } catch (err) {
      if (isDuplicateError(err)) {
        toast.error(t("base.secrets.error.duplicate"));
      } else {
        toast.error(errorMessage(err) ?? t("base.secrets.error.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="md"
      title={isEdit ? t("base.secrets.edit.title") : t("base.secrets.create.title")}
      closeOnMask={false}
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose} disabled={saving}>
            {t("base.common.cancel")}
          </Button>
          <Button
            type="primary"
            theme="solid"
            loading={saving}
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {t("base.common.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">
            {t("base.secrets.field.name")}
            <span className="text-error"> *</span>
          </span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={duplicate}
            placeholder={t("base.secrets.field.namePlaceholder")}
            className="h-9 rounded-md border border-border-default bg-bg-base px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none aria-invalid:border-error"
          />
          {duplicate ? (
            <span className="text-xs text-error">{t("base.secrets.error.duplicate")}</span>
          ) : null}
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {t("base.secrets.field.kind")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <SecretKindButton
              active={kind === "llm"}
              icon={<KeyRound size={14} />}
              label={t("base.secrets.kind.llm")}
              onClick={() => setKind("llm")}
            />
            <SecretKindButton
              active={kind === "external"}
              label={t("base.secrets.kind.external")}
              onClick={() => setKind("external")}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">
            {t("base.secrets.field.value")}
            {!isEdit ? <span className="text-error"> *</span> : null}
          </span>
          {isEdit ? (
            <span className="text-xs text-text-tertiary">
              {t("base.secrets.edit.valueSet", { values: { last4: secret?.last4 ?? "" } })}
            </span>
          ) : null}
          <div className="flex h-9 items-center rounded-md border border-border-default bg-bg-base focus-within:border-brand">
            <input
              value={value}
              type={revealed ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                isEdit
                  ? t("base.secrets.field.valuePlaceholderEdit")
                  : t("base.secrets.field.valuePlaceholder")
              }
              className="min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center text-text-tertiary transition-colors hover:text-text-primary"
              onClick={() => setRevealed((v) => !v)}
              aria-label={
                revealed ? t("base.secrets.field.hideValue") : t("base.secrets.field.showValue")
              }
              title={
                revealed ? t("base.secrets.field.hideValue") : t("base.secrets.field.showValue")
              }
            >
              {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>

        <div className="flex gap-2 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-5 text-text-secondary">
          <Lock size={14} className="mt-0.5 shrink-0 text-warning" />
          <span>{t("base.secrets.security.note")}</span>
        </div>
      </div>
    </BaseDialog>
  );
}

function SecretKindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm transition-colors ${
        active
          ? "border-brand bg-brand-tint text-brand"
          : "border-border-default bg-bg-base text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
