/**
 * 在线状态点(1:1 对齐旧 dmworkbase wk-onlinestatusbadge — 9×9 绿圆点,
 * 头像右下叠加,2px ring 跟列表背景区分)。
 *
 * 老仓有 `tip`(离线时显分钟数)字段,但 CSS `.wk-onlinestatusbadge-content-tip`
 * 永远 `display:none`,实际只渲染绿点。这里保持纯装饰。
 *
 * 显示条件由调用方判定(needShowOnlineStatus:online ‖ 1h 内离线)。
 */
export function ConversationOnlineBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute right-[-1px] bottom-[-1px] box-border rounded-full border-bg-base bg-success ${
        compact ? "h-[7px] w-[7px] border-[1.5px]" : "h-[9px] w-[9px] border-2"
      }`}
    />
  );
}
