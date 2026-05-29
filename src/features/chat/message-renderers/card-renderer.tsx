import { Channel, ChannelTypePerson, type Message } from "wukongimjssdk";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { CardContent } from "@/features/base/im/card-content";
import { openChatProfile } from "@/features/chat/lib/open-profile";

/**
 * 名片消息(对应旧 dmworkbase Messages/Card CardCell):头像 + 名字 + uid 行,
 * click → openChatProfile 弹 UserInfoModal(沿用 A6 全局 mount)。
 */
export function CardRenderer({ message }: { message: Message }) {
  const content = message.content as CardContent;
  const channel = new Channel(content.uid, ChannelTypePerson);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openChatProfile(content.uid);
      }}
      className="flex w-72 items-center gap-3 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={40} title={content.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-text-primary">
          {content.name || content.uid}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">个人名片</span>
      </div>
    </button>
  );
}
