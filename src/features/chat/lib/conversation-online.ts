export interface ConversationOnlineInfo {
  online?: boolean;
  lastOffline?: number;
}

export function shouldShowConversationOnline(info?: ConversationOnlineInfo): boolean {
  if (!info) return false;
  if (info.online) return true;
  const offlineAt = info.lastOffline ?? 0;
  const elapsedSeconds = Date.now() / 1000 - offlineAt;
  return elapsedSeconds > 0 && elapsedSeconds < 60 * 60;
}
