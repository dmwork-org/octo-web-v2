import type { SecretKind } from "@/features/base/api/endpoints/secrets.api";

export const OPEN_SECRETS_EVENT = "octo:open-secrets";

export interface OpenSecretsPayload {
  create?: boolean;
  value?: string;
  name?: string;
  kind?: SecretKind;
}

export function dispatchOpenSecrets(payload: OpenSecretsPayload = {}): void {
  window.dispatchEvent(
    new CustomEvent<OpenSecretsPayload>(OPEN_SECRETS_EVENT, { detail: payload }),
  );
}
