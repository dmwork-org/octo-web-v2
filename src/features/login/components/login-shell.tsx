import type { ReactNode } from "react";

/**
 * Login 页面外壳 — 两栏布局(对齐老仓 dmworklogin login.css `.wk-login`):
 *
 *   ┌──────────────────────────┬──────────────────────┐
 *   │ 55% 左 brand(紫蓝渐变)   │ 45% 右 form(白)      │
 *   │  logo + headline + sub   │  slogan + form ...   │
 *   │  + 聊天气泡装饰          │                      │
 *   └──────────────────────────┴──────────────────────┘
 *
 * 4 种 view(phone / qrcode / register / forgetPassword)都通过本 Shell 包裹,
 * 保证视觉一致性。
 */
interface LoginShellProps {
  /** 右侧 form 内容(slogan + form 由调用方提供)。 */
  children: ReactNode;
  /** 可选:右侧 form 顶部 banner(如 inviteInfo)。 */
  topBanner?: ReactNode;
}

export function LoginShell({ children, topBanner }: LoginShellProps) {
  return (
    <div className="absolute top-0 left-0 flex min-h-screen w-full overflow-y-auto bg-[#f5f6fa]">
      {/* 左 brand panel */}
      <div
        className="relative hidden min-h-screen w-[55%] flex-col items-center justify-center overflow-hidden px-16 py-15 md:flex"
        style={{ background: "linear-gradient(135deg, #7A5CFF, #40C9FF)" }}
      >
        {/* 装饰圆形 */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white/[0.06]"
          style={{ width: 500, height: 500, top: -120, right: -100 }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-white/[0.06]"
          style={{ width: 350, height: 350, bottom: -80, left: -60 }}
        />

        {/* logo 左上角 — 1:1 老仓 login.tsx:348(height 56 + marginBottom -10 + borderRadius 10 + gap 4) */}
        <div className="absolute top-10 left-14 z-10 flex items-center gap-1">
          <img
            src="/logo.svg"
            alt="logo"
            style={{ height: 56, width: "auto", marginBottom: -10, borderRadius: 10 }}
          />
          <span className="-mb-[18px] text-[22px] font-bold tracking-[0.5px] text-white">Octo</span>
        </div>

        {/* 中部 hero */}
        <div className="relative z-10 mx-auto w-full max-w-[440px]">
          <div className="mb-3 text-[40px] leading-[1.25] font-bold text-white">
            AI Agent 时代的
            <br />
            即时通讯平台
          </div>
          <div className="mb-9 text-[15px] leading-[1.65] text-white/80">
            连接人与 AI，让协作更高效。
            <br />
            支持 Web、Mac、Windows、Linux 全平台。
          </div>
        </div>

        {/* 聊天气泡装饰 — 绝对底部,fadeIn 错位 */}
        <div className="absolute right-16 bottom-9 left-16 z-10 flex max-w-[380px] flex-col gap-2.5">
          <ChatBubble
            side="left"
            name="Octo AI"
            text="你好！我可以帮你整理今天的会议纪要 📝"
            delay="0.2s"
          />
          <ChatBubble side="right" text="好的，会议录音已发给你" delay="0.5s" />
          <ChatBubble
            side="left"
            name="Octo AI"
            text="收到，正在生成摘要，稍等片刻 ⚡"
            delay="0.8s"
          />
        </div>
      </div>

      {/* 右 form panel */}
      <div className="relative flex min-h-screen w-full items-center justify-center overflow-y-auto bg-white px-12 py-10 md:w-[45%]">
        <div className="flex w-full max-w-[400px] flex-col">
          {/* 移动端 logo fallback(md 以上隐藏,因 brand panel 已显) */}
          <div className="mb-6 flex items-center justify-center md:hidden">
            <img src="/logo.svg" alt="logo" className="h-14 w-14 rounded-[14px]" />
          </div>
          {topBanner ? <div className="mb-4">{topBanner}</div> : null}
          {children}
        </div>
      </div>

      {/* 聊天气泡 fadeIn keyframes(局部 style 注入避免污染全局) */}
      <style>{`
        @keyframes wk-chat-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

interface ChatBubbleProps {
  side: "left" | "right";
  name?: string;
  text: string;
  delay: string;
}

function ChatBubble({ side, name, text, delay }: ChatBubbleProps) {
  const isRight = side === "right";
  return (
    <div
      className={`flex items-end gap-2 ${isRight ? "flex-row-reverse" : ""}`}
      style={{ animation: "wk-chat-fade-in 0.4s ease forwards", animationDelay: delay, opacity: 0 }}
    >
      {!isRight ? (
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/[0.25]">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>
      ) : null}
      <div className="max-w-[240px]">
        {name ? <div className="mb-1 pl-2.5 text-[11px] text-white/60">{name}</div> : null}
        <div
          className={`px-3.5 py-2 text-[13px] leading-[1.5] backdrop-blur-md ${
            isRight
              ? "rounded-[12px_12px_2px_12px] bg-white/90 text-[#1a1a2e]"
              : "rounded-[12px_12px_12px_2px] bg-white/[0.18] text-white"
          }`}
        >
          {text}
        </div>
      </div>
    </div>
  );
}
