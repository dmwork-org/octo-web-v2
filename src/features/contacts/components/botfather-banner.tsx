import { ChevronRight } from "lucide-react";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";

const BOTFATHER_UID = "botfather";

/**
 * 通讯录顶部 BotFather 引荐卡(对应旧 .wk-contacts-botfather-banner):
 * 渐变背景 + 头像 + 名字 + 描述 + 右箭头,点击直接进 BotFather 对话。
 *
 * 渐变 #7C5CFC → #00D4AA 135deg 对应旧 CSS,不走 Tailwind 主题色(主题色
 * 会随 spaceId 配色变,BotFather 卡固定紫青色)。
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
      style={{ background: "linear-gradient(135deg, #7C5CFC, #00D4AA)" }}
      className="mx-3 mt-3 flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left transition-opacity hover:opacity-90"
    >
      <div className="shrink-0">
        <ChannelAvatar channel={channel} size={32} title="BotFather" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-white">BotFather</span>
        <span className="truncate text-[10px] font-medium text-white/70">
          创建和管理你的 AI 机器人
        </span>
      </div>
      <ChevronRight size={16} className="shrink-0 text-white/60" />
    </button>
  );
}
