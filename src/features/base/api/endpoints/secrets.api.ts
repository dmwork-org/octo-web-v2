import { api } from "@/features/base/api/client";

export type SecretKind = "llm" | "external";

export interface SecretListItem {
  secret_id: string;
  display_name: string;
  kind: SecretKind;
  masked?: string;
  last4?: string;
  created_at: string;
  updated_at?: string;
  last_used_at?: string | null;
}

interface SecretListResponse {
  secrets?: SecretListItem[];
  list?: SecretListItem[];
  items?: SecretListItem[];
  data?: SecretListResponse | SecretListItem[];
}

export interface CreateSecretRequest {
  display_name: string;
  kind: SecretKind;
  key: string;
}

export interface UpdateSecretRequest {
  display_name?: string;
  kind?: SecretKind;
  key?: string;
}

const BASE = "manager/secrets";

export function maskSecretFromLast4(last4?: string): string {
  return last4 ? `••••${last4}` : "••••••••";
}

export function normalizeSecretName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function pickSecretListItem(it: SecretListItem): SecretListItem {
  const safe: SecretListItem = {
    secret_id: it.secret_id,
    display_name: it.display_name,
    kind: it.kind,
    masked: it.masked ?? maskSecretFromLast4(it.last4),
    created_at: it.created_at,
  };
  if (it.last4 != null) safe.last4 = it.last4;
  if (it.updated_at != null) safe.updated_at = it.updated_at;
  if (it.last_used_at !== undefined) safe.last_used_at = it.last_used_at;
  return safe;
}

export function normalizeSecretsList(
  resp: SecretListResponse | SecretListItem[] | null | undefined,
): SecretListItem[] {
  if (!resp) return [];
  let body: SecretListResponse | SecretListItem[] = resp;
  if (!Array.isArray(body) && body.data != null) {
    body = body.data;
  }
  const raw = Array.isArray(body) ? body : (body.items ?? body.secrets ?? body.list ?? []);
  return raw.map(pickSecretListItem);
}

export async function listSecrets(): Promise<SecretListItem[]> {
  const resp = await api<SecretListResponse | SecretListItem[]>(BASE, { silent: true } as never);
  return normalizeSecretsList(resp);
}

export async function createSecret(body: CreateSecretRequest): Promise<SecretListItem> {
  const resp = await api<SecretListItem>(BASE, {
    method: "POST",
    body,
    silent: true,
  } as never);
  return pickSecretListItem(resp);
}

export async function updateSecret(
  secretId: string,
  body: UpdateSecretRequest,
): Promise<SecretListItem> {
  const resp = await api<SecretListItem>(`${BASE}/${encodeURIComponent(secretId)}`, {
    method: "PUT",
    body,
    silent: true,
  } as never);
  return pickSecretListItem(resp);
}

export async function deleteSecret(secretId: string): Promise<void> {
  await api(`${BASE}/${encodeURIComponent(secretId)}`, {
    method: "DELETE",
    silent: true,
  } as never);
}
