import { t } from "@/lib/i18n/instance";
import type { ConversationOnlineInfo } from "@/features/chat/lib/conversation-online";

function getOfflineTip(info?: ConversationOnlineInfo): string | undefined {
  if (!info || info.online) return undefined;
  const offlineAt = info.lastOffline ?? 0;
  const elapsedSeconds = Date.now() / 1000 - offlineAt;
  if (elapsedSeconds <= 0 || elapsedSeconds >= 60 * 60) return undefined;
  if (elapsedSeconds < 60) return t("conversationList.justNow");
  return t("conversationList.minutesAgoShort", {
    values: { count: Math.round(elapsedSeconds / 60) },
  });
}

/**
 * 在线状态 badge:在线为头像右下绿点;离线 1h 内显示短时间胶囊。
 *
 * `info` 可选是为了保持旧调用兼容:未传时退化为纯绿点。
 * 显示条件仍由调用方判定(online ‖ 1h 内离线)。
 */
export function ConversationOnlineBadge({
  compact = false,
  info,
}: {
  compact?: boolean;
  info?: ConversationOnlineInfo;
}) {
  const tip = getOfflineTip(info);
  if (tip) {
    return (
      <span
        aria-hidden
        className="absolute right-[-6px] bottom-[-3px] box-border rounded-[5px] bg-bg-base p-px whitespace-nowrap"
      >
        <span className="block rounded-[4px] bg-success/12 px-[3px] text-[9px] leading-[13px] font-medium text-success">
          {tip}
        </span>
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`absolute right-[-1px] bottom-[-1px] box-border rounded-full border-bg-base bg-success ${
        compact ? "h-[7px] w-[7px] border-[1.5px]" : "h-[9px] w-[9px] border-2"
      }`}
    />
  );
}
