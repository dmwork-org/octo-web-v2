import { ChevronRight } from "lucide-react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";

const BOTFATHER_UID = "botfather";

/**
 * 通讯录顶部 BotFather 引荐卡(对应旧 .wk-contacts-botfather-banner):
 * 渐变背景 + 头像 + 名字 + 描述 + 右箭头,点击直接进 BotFather 对话。
 */
export function BotfatherBanner() {
  const channel = new Channel(BOTFATHER_UID, ChannelTypePerson);
  const onClick = () => {
    chatSelectedActions.select(channel);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-lg bg-gradient-to-r from-brand to-accent px-4 py-3 text-left transition-opacity hover:opacity-90"
    >
      <div className="shrink-0">
        <ChannelAvatar channel={channel} size={36} title="BotFather" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-white">BotFather</span>
        <span className="truncate text-[11px] text-white/75">创建和管理你的 AI 机器人</span>
      </div>
      <ChevronRight size={16} className="shrink-0 text-white/70" />
    </button>
  );
}
