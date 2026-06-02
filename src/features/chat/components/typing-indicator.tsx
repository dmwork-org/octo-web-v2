import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { TypingRenderer } from "@/features/chat/message-renderers/typing-renderer";
import type { TypingInfo } from "@/features/chat/services/typing-manager";

interface TypingIndicatorProps {
  info: TypingInfo;
}

/**
 * Typing 状态显示行(1:1 对齐旧 dmworkbase Messages/Typing TypingCell):
 *
 *   [头像 36×36] [昵称 + AI 徽标?]
 *                [3 跳动点]
 *
 * 通过 channelInfo.title 拿昵称(fromUID 兜底);AI badge 由
 * `channelInfo.orgData.robot === 1` 判定,统一走共用 `<AiBadge />`。
 *
 * 跟普通 MessageRow 视觉一致(头像 + sender + body),只是 body 是
 * TypingRenderer 跳动点。
 */
export function TypingIndicator({ info }: TypingIndicatorProps) {
  const { fromUID, fromName } = info;
  const personChannel = new Channel(fromUID, ChannelTypePerson);
  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(personChannel);
  const displayName = channelInfo?.title || fromName || fromUID;
  const isBot = (channelInfo?.orgData as { robot?: number } | undefined)?.robot === 1;

  return (
    <div className="group relative mt-6 flex items-start gap-3 px-4">
      <button
        type="button"
        aria-label={`${displayName} 的头像`}
        className="shrink-0 cursor-default"
        tabIndex={-1}
      >
        <ChannelAvatar channel={personChannel} size={36} title={displayName} />
      </button>
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <header className="flex h-[22px] items-center gap-2 leading-[22px]">
          <span className="truncate text-[15px] font-semibold text-text-primary">
            {displayName}
          </span>
          {isBot ? <AiBadge /> : null}
        </header>
        <TypingRenderer />
      </div>
    </div>
  );
}
