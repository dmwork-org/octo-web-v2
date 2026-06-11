import { useT } from "@/lib/i18n/use-t";

/**
 * "以上为历史消息" 分割线(对齐老仓 Messages/HistorySplit/index.tsx,issue #32):
 *   - 左右两条横线 + 中间提示文字
 *   - 进入会话时若有 unread,在"最后已读消息"(lastMessage.messageSeq - unread)
 *     之后插入一行,提示用户"以上为历史消息,以下为本次新消息"
 *   - 用 use-history-split.hook 锁定 splitAfterSeq;message-list 渲染遇到
 *     该 seq 时在消息后追加本组件
 *
 * 样式参考老仓 wk-message-split-box:两条 line + 中间小文本。
 */
export function HistoryDivider() {
  const t = useT();
  return (
    <div className="my-3 flex items-center gap-3 px-4">
      <div className="h-px flex-1 bg-border-default" />
      <span className="shrink-0 text-[11px] leading-[1.5] text-text-tertiary">
        {t("message.historySplit")}
      </span>
      <div className="h-px flex-1 bg-border-default" />
    </div>
  );
}
