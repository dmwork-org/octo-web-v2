import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK from "wukongimjssdk";
import { imConnectionStore } from "@/features/base/stores/im-connection";
import { imLatencyQueryOptions } from "@/features/chat/queries/im-latency.query";

/** 延迟 → 信号格档位(对齐旧 dmworkbase ConnectionStatus.getSignalBars)。 */
function bandsOf(ms: number | undefined, connected: boolean): 0 | 1 | 2 | 3 {
  if (!connected) return 0;
  if (ms === undefined) return 2; // 还未拿到结果,先给 2 格
  if (ms < 100) return 3;
  if (ms <= 300) return 2;
  return 1;
}

/** 延迟 → bar 颜色(连接态),非连接态走外层颜色。 */
function colorOf(ms: number | undefined): string {
  if (ms === undefined) return "#22c55e"; // 默认绿(待测)
  if (ms < 100) return "#22c55e";
  if (ms <= 300) return "#eab308";
  return "#ef4444";
}

function formatDuration(since: number | null): string {
  if (!since) return "";
  const sec = Math.floor((Date.now() - since) / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟`;
  const hr = Math.floor(min / 60);
  return `${hr} 小时${min % 60} 分`;
}

/**
 * 信号格 SVG(3 段竖条):对应旧 dmworkbase ConnectionStatus 同款 viewBox 16×16。
 * inactive 段显示 border-default 色,active 段按 latency 着色。
 */
function SignalBars({
  size,
  bands,
  activeColor,
  blink,
}: {
  size: number;
  bands: 0 | 1 | 2 | 3;
  activeColor: string;
  blink: boolean;
}) {
  const inactive = "var(--color-border-default, #e5e7eb)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={blink ? "animate-pulse" : undefined}
      aria-hidden="true"
    >
      <rect x="1" y="11" width="3" height="5" rx="0.5" fill={bands >= 1 ? activeColor : inactive} />
      <rect x="6" y="7" width="3" height="9" rx="0.5" fill={bands >= 2 ? activeColor : inactive} />
      <rect
        x="11"
        y="3"
        width="3"
        height="13"
        rx="0.5"
        fill={bands >= 3 ? activeColor : inactive}
      />
    </svg>
  );
}

/**
 * 顶栏连接状态徽章(对应旧 dmworkbase Components/ConnectionStatus,compact 模式):
 *
 *   [ ▁▃▅ 13ms ]   ← 已连接(信号格 + 延迟数字,颜色随延迟)
 *   [ ▁▃▅ 连接中... ]   ← Connecting,信号格 2 格闪动黄
 *   [ ░░░ 已断开 ]  ← Disconnected,信号格全灰 + 红字,可点重连
 *
 * tooltip(hover):状态 / 延迟 / 已连接时长 / "点击重连"
 *
 * 数据源:
 * - status / connectedSince ← imConnectionStore
 * - latency ← useQuery(imLatencyQueryOptions),enabled 只在 connected 时
 *
 * 点击行为:非 connected 时 WKSDK.connectManager.connect() 触发手动 retry
 * (覆盖 SDK 自动重连失败场景)。
 */
export function ConnectionStatusBadge() {
  const status = useStore(imConnectionStore, (s) => s.status);
  const connectedSince = useStore(imConnectionStore, (s) => s.connectedSince);
  const lastError = useStore(imConnectionStore, (s) => s.lastError);
  const [hovered, setHovered] = useState(false);

  const connected = status === "connected";
  const connecting = status === "connecting";

  // latency 只在 connected 时拉
  const latencyQ = useQuery(imLatencyQueryOptions(connected));
  const latency = connected ? latencyQ.data : undefined;

  const bands = bandsOf(latency, connected);
  const activeColor = useMemo(() => {
    if (connected) return colorOf(latency);
    if (connecting) return "#eab308";
    return "#ef4444";
  }, [connected, connecting, latency]);

  const labelText = (() => {
    if (connected) return latency !== undefined ? `${latency}ms` : "测速中…";
    if (connecting) return "连接中…";
    if (status === "kicked") return "已下线";
    return "已断开";
  })();

  const statusText = (() => {
    if (connected) return "已连接";
    if (connecting) return "连接中";
    if (status === "kicked") return "已被踢下线";
    if (status === "failed") return "连接失败";
    return "已断开";
  })();

  const handleClick = () => {
    if (!connected && !connecting) {
      WKSDK.shared().connectManager.connect();
    }
  };

  const cursor = connected ? "default" : "pointer";

  return (
    <div
      className="relative flex items-center gap-1 px-1"
      style={{ cursor }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      role={connected ? "status" : "button"}
      aria-label={`连接状态:${statusText}`}
    >
      <SignalBars size={12} bands={bands} activeColor={activeColor} blink={connecting} />
      <span
        className="text-[11px] leading-none tabular-nums"
        style={{ color: activeColor, fontVariantNumeric: "tabular-nums" }}
      >
        {labelText}
      </span>

      {hovered ? (
        <div className="pointer-events-none absolute top-full right-0 z-50 mt-1 flex w-44 flex-col gap-0.5 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-2 text-[12px] leading-snug text-text-primary shadow-lg">
          <div>
            状态:<span style={{ color: activeColor }}>{statusText}</span>
          </div>
          {connected && latency !== undefined ? <div>延迟:{latency} ms</div> : null}
          {connected && connectedSince ? <div>已连接:{formatDuration(connectedSince)}</div> : null}
          {!connected && lastError ? <div className="text-text-tertiary">{lastError}</div> : null}
          {!connected && !connecting ? <div className="mt-1 text-brand">点击重连</div> : null}
        </div>
      ) : null}
    </div>
  );
}
