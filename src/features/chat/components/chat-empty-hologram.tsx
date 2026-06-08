/**
 * Chat 主区空白态 — 1:1 复刻旧 dmworkbase `.wk-chat-empty-hologram`。
 */
import { useT } from "@/lib/i18n/use-t";

export function ChatEmptyHologram() {
  const t = useT();
  return (
    <section
      className="flex h-full w-full flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "#f6f6f6" }}
    >
      <style>{HOLOGRAM_KEYFRAMES}</style>
      <svg width="280" height="220" viewBox="0 0 320 250" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="es-a1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#00D4AA" stopOpacity="0.04" />
          </linearGradient>
          <linearGradient id="es-a2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7C5CFC" />
            <stop offset="100%" stopColor="#00D4AA" />
          </linearGradient>
          <radialGradient id="es-a3" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="160" cy="125" r="100" fill="url(#es-a1)" />

        <circle
          cx="55"
          cy="70"
          r="16"
          fill="white"
          stroke="#00D4AA"
          strokeWidth="1.5"
          opacity="0.65"
        />
        <circle cx="55" cy="70" r="5" fill="#00D4AA" opacity="0.25" />
        <circle
          cx="40"
          cy="130"
          r="12"
          fill="white"
          stroke="#00D4AA"
          strokeWidth="1.2"
          opacity="0.45"
        />
        <circle cx="40" cy="130" r="3.5" fill="#00D4AA" opacity="0.18" />
        <circle
          cx="65"
          cy="180"
          r="13"
          fill="white"
          stroke="#00D4AA"
          strokeWidth="1.3"
          opacity="0.5"
        />
        <circle cx="65" cy="180" r="4" fill="#00D4AA" opacity="0.2" />

        <rect
          x="245"
          y="55"
          width="30"
          height="30"
          rx="7"
          fill="white"
          stroke="#7C5CFC"
          strokeWidth="1.5"
          opacity="0.65"
        />
        <circle cx="260" cy="70" r="5" fill="#7C5CFC" opacity="0.25" />
        <rect
          x="255"
          y="118"
          width="26"
          height="26"
          rx="6"
          fill="white"
          stroke="#7C5CFC"
          strokeWidth="1.2"
          opacity="0.45"
        />
        <circle cx="268" cy="131" r="3.5" fill="#7C5CFC" opacity="0.18" />
        <rect
          x="240"
          y="172"
          width="28"
          height="28"
          rx="6.5"
          fill="white"
          stroke="#7C5CFC"
          strokeWidth="1.3"
          opacity="0.5"
        />
        <circle cx="254" cy="186" r="4" fill="#7C5CFC" opacity="0.2" />

        <circle cx="160" cy="125" r="26" fill="url(#es-a3)" />
        <circle
          cx="160"
          cy="125"
          r="14"
          fill="white"
          stroke="url(#es-a2)"
          strokeWidth="1.8"
          opacity="0.75"
        />
        <circle
          cx="160"
          cy="125"
          r="5"
          fill="url(#es-a2)"
          opacity="0.35"
          className="wk-hologram-pulse"
        />

        <line
          x1="71"
          y1="72"
          x2="146"
          y2="122"
          stroke="#00D4AA"
          strokeWidth="1"
          strokeDasharray="4,6"
          opacity="0.3"
          className="wk-hologram-dash"
        />
        <line
          x1="52"
          y1="130"
          x2="146"
          y2="126"
          stroke="#00D4AA"
          strokeWidth="0.8"
          strokeDasharray="4,6"
          opacity="0.22"
          className="wk-hologram-dash"
        />
        <line
          x1="78"
          y1="178"
          x2="148"
          y2="130"
          stroke="#00D4AA"
          strokeWidth="0.8"
          strokeDasharray="4,6"
          opacity="0.18"
          className="wk-hologram-dash"
        />
        <line
          x1="245"
          y1="70"
          x2="174"
          y2="122"
          stroke="#7C5CFC"
          strokeWidth="1"
          strokeDasharray="4,6"
          opacity="0.3"
          className="wk-hologram-dash"
        />
        <line
          x1="255"
          y1="131"
          x2="174"
          y2="126"
          stroke="#7C5CFC"
          strokeWidth="0.8"
          strokeDasharray="4,6"
          opacity="0.22"
          className="wk-hologram-dash"
        />
        <line
          x1="240"
          y1="186"
          x2="172"
          y2="130"
          stroke="#7C5CFC"
          strokeWidth="0.8"
          strokeDasharray="4,6"
          opacity="0.18"
          className="wk-hologram-dash"
        />

        <circle cx="108" cy="98" r="2" fill="#00D4AA" opacity="0.4" className="wk-hologram-pulse" />
        <circle cx="210" cy="98" r="2" fill="#7C5CFC" opacity="0.4" className="wk-hologram-pulse" />
      </svg>

      <div className="text-[15px] font-medium text-[#6B7075]">{t("chatEmpty.title")}</div>
      <div className="text-[12px] text-[#B8BCC8]">
        {t("chatEmpty.subtitle")} <span className="text-[#7C5CFC]">✦</span>
      </div>
    </section>
  );
}

const HOLOGRAM_KEYFRAMES = `
@keyframes wk-hologram-pulse {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.6; }
}
@keyframes wk-hologram-dash {
  100% { stroke-dashoffset: -20; }
}
.wk-hologram-pulse {
  animation: wk-hologram-pulse 2.5s ease-in-out infinite;
}
.wk-hologram-dash {
  animation: wk-hologram-dash 2s linear infinite;
}
`;
