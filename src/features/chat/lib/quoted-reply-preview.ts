export function quotedReplyPreviewText(typeHint: string, digest: string): string {
  const hint = typeHint.trim();
  const content = digest.trim();

  if (!hint) return content;
  if (!content) return hint;
  if (content === hint) return hint;
  return `${hint} ${content}`;
}
