import { useMemo } from "react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useT } from "@/lib/i18n/use-t";
import type { AppBotInfo } from "@/features/appbot/types/app-bot.types";

interface BotRowProps {
  bot: AppBotInfo;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function BotRow({ bot, selected, disabled = false, onClick }: BotRowProps) {
  const t = useT();
  const channel = useMemo(() => new Channel(bot.uid, ChannelTypePerson), [bot.uid]);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) disabled:cursor-not-allowed disabled:opacity-60 ${
        selected ? "bg-brand-tint" : "hover:bg-bg-hover"
      }`}
    >
      <ChannelAvatar channel={channel} size={36} title={bot.display_name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">{bot.display_name}</span>
        <span className="truncate text-[11px] text-text-tertiary">
          {bot.description || t("appbot.list.defaultDescription")}
        </span>
      </div>
    </button>
  );
}
