import { useEffect, useState } from "react";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";

interface UserNameProps {
  uid: string;
  /** 可选 className,便于在卡片 / 详情里调字号字色。 */
  className?: string;
}

/**
 * Person channelInfo live hook(参考 features/chat/components/chat-header.tsx
 * useChannelInfoLive):
 * - mount 时若 SDK cache 没命中,主动 fetchChannelInfo(SDK 自带 dedupe)
 * - 订阅 channelManager listener,异步拉到名字后 force 重渲一次
 * - cleanup removeListener,防止泄漏
 */
function usePersonChannelInfoLive(uid: string) {
  const [, force] = useState(0);

  useEffect(() => {
    const mgr = WKSDK.shared().channelManager;
    const channel = new Channel(uid, ChannelTypePerson);
    if (!mgr.getChannelInfo(channel)) {
      void mgr.fetchChannelInfo(channel);
    }
    const listener = () => force((v) => v + 1);
    mgr.addListener(listener);
    return () => {
      mgr.removeListener(listener);
    };
  }, [uid]);

  return WKSDK.shared().channelManager.getChannelInfo(new Channel(uid, ChannelTypePerson));
}

/**
 * 用户名展示:WKSDK channelManager 同步读 + 缓存未命中时异步 fetch。
 * fallback:uid 文本。
 *
 * 在 matter 列表卡片 / 详情面板多处复用(creator / assignees),复用同一份
 * SDK channelInfo cache,避免每个组件单独发请求。
 */
export function UserName({ uid, className }: UserNameProps) {
  const info = usePersonChannelInfoLive(uid);
  const name = info?.title ?? uid;
  return <span className={className}>{name}</span>;
}
