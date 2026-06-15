const SECRET_PREFIX_RE = /(?:^|[^A-Za-z0-9_-])((?:sk|bf|app)-[A-Za-z0-9_-]{12,})/;

export interface DetectedSecret {
  value: string;
  prefix: string;
}

export function detectPastedSecret(text: string): DetectedSecret | null {
  if (!text) return null;
  const match = SECRET_PREFIX_RE.exec(text);
  if (!match) return null;
  const value = match[1];
  const dash = value.indexOf("-");
  return {
    value,
    prefix: value.slice(0, dash + 1),
  };
}

export function handleSecretPaste(
  pastedText: string,
  onDetected: (value: string) => void,
): boolean {
  const hit = detectPastedSecret(pastedText);
  if (!hit) return false;
  onDetected(hit.value);
  return true;
}
