import { MessageContentType, type Message, type MessageText } from "wukongimjssdk";
import { MessageContentTypeConst } from "@/features/base/im/content-types";
import { Markdown } from "@/components/ui/markdown";
import { MessageRow } from "@/features/chat/components/message-row";
import { type FoldSession } from "@/features/chat/lib/fold-session";

interface FoldSessionCardProps {
  session: FoldSession;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * AI 多 bot 协作折叠会话卡(1:1 对齐旧 dmworkbase Conversation.renderFoldSession +
 * fold-session-avatar.svg + FoldSessionExpandedList):
 *
 * 结构(对齐旧 .wk-message-item-fold-session-shell + content):
 *   - shell: mt-6 + px-4 + gap-2 + items-start
 *   - avatar: 32×32 inline SVG(蓝紫渐变圆 + AI logo,对齐旧 fold-session-avatar.svg)
 *   - content:
 *     - title row: 参与者名(× 分隔)+ "AI协作" 紫胶囊 + 时间 + 右侧 toggle btn
 *     - 卡片 bg rgba(28,28,35,0.04) / r 8 / p 12 / max-w min(680, vw-120)
 *
 * **折叠态**(对齐 renderFoldSessionSummary line 1118-1144):
 *   - text → Markdown body
 *   - 其他 → conversationDigest 字符串
 *   - **不渲染 sender 灰胶囊**(sender 已在卡片头部"参与者名" + 时间)
 *
 * **展开态**:走 MessageRow 普通流(用户允许 — 时间/sender 走 message-row 统一逻辑,
 * 不强求旧 FoldSessionExpandedList 的简版样式)。
 *
 * 简化(对齐旧但未实现):
 *   - 单 AI "AI助手" vs 多 AI "AI协作" 区分 — 都用 "AI协作"
 *   - > 5 AI tooltip 折叠
 *   - typing 实时合并(BeatLoader)+ 120s 自动失活定时器
 *   - shouldMergeFlash / appearing 动效
 */
export function FoldSessionCard({ session, expanded, onToggle }: FoldSessionCardProps) {
  const { participants, messages, lastMessage } = session;
  const participantLabel = participants.map((p) => p.name).join(" × ") || "AI";
  const time = formatTime(lastMessage.timestamp);

  return (
    <div className="mt-6 flex items-start gap-2 px-4">
      {/* AI 圆形头像 — 对齐旧 fold-session-avatar.svg */}
      <FoldSessionAvatar />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* 标题行 */}
        <header className="flex max-w-[min(680px,calc(100vw_-_120px))] flex-wrap items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-[#000]">{participantLabel}</span>
          <span className="inline-flex h-[18px] shrink-0 items-center rounded-[4px] bg-gradient-to-r from-[#7b89f4] to-[#9d78f5] px-1.5 text-[11px] leading-none font-medium text-white">
            AI协作
          </span>
          <span className="text-[14px] text-[rgba(28,28,35,0.4)]">{time}</span>
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto cursor-pointer text-[12px] font-semibold whitespace-nowrap text-[#7f3bf5] transition-opacity hover:opacity-80"
          >
            {expanded ? "收起" : `展开 ${messages.length} 条讨论`}
          </button>
        </header>

        {/* 卡片体 */}
        <div className="w-full max-w-[min(680px,calc(100vw_-_120px))] overflow-hidden rounded-lg bg-[rgba(28,28,35,0.04)] p-3">
          {expanded ? (
            <FoldSessionExpanded messages={messages} />
          ) : (
            <FoldSessionSummary message={lastMessage} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 折叠态摘要 — 对齐旧 renderFoldSessionSummary(只渲染 body,无 sender header):
 *   - text → Markdown
 *   - 其他 → conversationDigest 字符串
 */
function FoldSessionSummary({ message }: { message: Message }) {
  if (message.contentType === MessageContentType.text) {
    const text = (message.content as MessageText).text ?? "";
    return <Markdown content={text} />;
  }
  const digest =
    (message.content as { conversationDigest?: string } | undefined)?.conversationDigest ?? "";
  return <span className="text-[14px] text-[rgba(28,28,35,0.8)]">{digest}</span>;
}

/**
 * 展开态:渲染所有 messages(走 MessageRow 统一逻辑,sender 名 + 时间复用 message-row
 * 内部 senderDisplay + formatSenderTime,不重写)。
 */
function FoldSessionExpanded({ messages }: { messages: Message[] }) {
  return (
    <div className="-mx-3 -my-3 flex flex-col">
      {messages.map((m, i) => (
        <MessageRow
          key={m.clientMsgNo || m.messageID}
          message={m}
          continueWithPrev={i > 0 && messages[i - 1].fromUID === m.fromUID}
          bare={shouldRenderBare(m)}
        />
      ))}
    </div>
  );
}

/** 跟 message-list shouldRenderBare 同款(本地副本避免循环依赖)。 */
function shouldRenderBare(m: Message): boolean {
  if (m.remoteExtra?.revoke) return true;
  const ct = m.contentType;
  if (ct === MessageContentTypeConst.threadCreated) return false;
  if (ct >= 1000 && ct <= 2000) return true;
  return false;
}

/** HH:mm 格式化(对齐旧 timeOnly)。 */
function formatTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * AI 协作头像 — 1:1 内联 inline 旧 fold-session-avatar.svg
 * (路径 packages/dmworkbase/src/Components/Conversation/fold-session-avatar.svg)。
 * 32×32 圆 + 渐变 #41DFFF→#7F3BF5 + 白色 AI logo。
 */
function FoldSessionAvatar() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="16" fill="url(#fold-session-grad)" />
      <g clipPath="url(#fold-session-clip)">
        <path
          d="M8.14967 6.2245C8.55742 6.1095 8.99917 6.22675 9.34942 6.44875C9.69317 6.6605 9.91917 7.02925 10.0089 7.4175C10.1284 7.896 9.94317 8.41025 9.61717 8.76625C9.47692 8.921 9.27467 9.00525 9.14842 9.17475C9.04817 9.301 9.00242 9.464 9.00092 9.6235C8.99917 10.2047 9.00292 10.786 8.99917 11.3672C9.78517 10.4772 10.7489 9.74975 11.7999 9.201C12.9812 8.5925 14.2914 8.234 15.6192 8.16775C17.6337 8.0835 19.6572 8.71425 21.3042 9.86925C21.9334 10.3092 22.5187 10.8152 23.0242 11.394C23.0252 10.804 23.0259 10.2137 23.0239 9.62375C23.0207 9.359 22.8429 9.13775 22.6437 8.98175C22.2352 8.71325 22.0079 8.22675 21.9782 7.74825C21.9852 7.338 22.1627 6.93775 22.4422 6.64C22.7234 6.36525 23.1067 6.1895 23.5017 6.17725C23.8097 6.18525 24.1137 6.2865 24.3697 6.45775C24.7254 6.68775 24.9507 7.0855 25.0249 7.497C25.0812 7.77325 25.0229 8.06 24.9144 8.316C24.7987 8.5785 24.6214 8.82 24.3804 8.98C24.1762 9.11825 24.0264 9.3455 24.0269 9.59775C24.0237 10.682 24.0274 11.7662 24.0249 12.8507C24.0179 12.9292 24.0669 12.9955 24.0999 13.0625C25.0407 14.9492 25.5747 17.027 25.7387 19.1255C25.7724 19.556 25.8047 19.9877 25.7812 20.4195C25.7122 21.253 25.3249 22.0317 24.7927 22.6662C24.3687 23.1805 23.8317 23.5887 23.2747 23.949C21.9119 24.8032 20.3564 25.3115 18.7789 25.588C17.0629 25.8862 15.3002 25.9067 13.5779 25.6457C12.3979 25.4677 11.2332 25.1605 10.1367 24.6862C9.20342 24.282 8.31417 23.753 7.57117 23.0535C6.93367 22.4247 6.42942 21.6282 6.26592 20.7382C6.20817 20.471 6.20917 20.1967 6.21192 19.9247C6.29867 17.5207 6.84817 15.116 7.94517 12.9675C7.96542 12.9217 8.00167 12.88 7.99992 12.8277C7.99967 11.7682 8.00017 10.7087 7.99967 9.6495C8.00267 9.44025 7.89917 9.2425 7.75017 9.1005C7.63842 8.9765 7.48317 8.90225 7.37342 8.77575C7.11742 8.48825 6.96767 8.10925 6.95292 7.725C6.96417 7.40725 7.07717 7.096 7.25842 6.8355C7.46467 6.529 7.79617 6.3195 8.14967 6.2245ZM20.4092 13.3332C20.3022 13.3412 20.1982 13.3777 20.1042 13.4287C19.8912 13.5417 19.7897 13.7927 19.7804 14.0235C19.7794 16.0492 19.7807 18.075 19.7799 20.1007C19.7819 20.2365 19.8132 20.374 19.8832 20.4915C19.9882 20.6862 20.2092 20.7957 20.4239 20.8117C20.5399 20.8037 20.6524 20.7622 20.7529 20.705C20.9407 20.5987 21.0404 20.3817 21.0617 20.1745C21.0632 18.1085 21.0619 16.042 21.0624 13.9757C21.0514 13.8235 20.9902 13.674 20.8969 13.5537C20.7744 13.4177 20.5909 13.3395 20.4092 13.3332ZM13.8842 13.363C13.4417 13.4157 13.0264 13.6247 12.6994 13.924C12.4829 14.137 12.3292 14.4057 12.2127 14.6842C11.4852 16.3067 10.7574 17.9292 10.0304 19.552C9.96542 19.7045 9.88742 19.8515 9.83267 20.0082C9.75117 20.2172 9.84842 20.449 9.98367 20.612C10.1089 20.7295 10.2784 20.8032 10.4504 20.8112C10.6899 20.7892 10.9317 20.6507 11.0192 20.417C11.7519 18.7897 12.4769 17.1587 13.2062 15.5297C13.2819 15.3445 13.3757 15.168 13.4624 14.9882C13.5532 14.873 13.6757 14.7825 13.8199 14.7475C14.1059 14.6692 14.4257 14.676 14.6969 14.8035C14.8024 14.8662 14.8987 14.9557 14.9507 15.0685C15.7524 16.8597 16.5527 18.6515 17.3542 20.4427C17.4047 20.553 17.4867 20.649 17.5942 20.7067C17.7352 20.7845 17.9054 20.8427 18.0652 20.7917C18.1989 20.7507 18.3379 20.6895 18.4214 20.572C18.5444 20.4037 18.6154 20.175 18.5252 19.9755C18.3519 19.5687 18.1652 19.1672 17.9872 18.7622C17.3567 17.3512 16.7274 15.9397 16.0964 14.529C15.9652 14.2667 15.7937 14.0185 15.5637 13.8335C15.1042 13.4472 14.4769 13.2732 13.8842 13.363ZM13.9104 18.2905C13.6019 18.352 13.2917 18.4992 13.1059 18.7617C12.9562 18.9615 12.8907 19.2277 12.9477 19.4725C13.0087 19.7992 13.2709 20.0522 13.5607 20.1925C13.8437 20.3165 14.1674 20.365 14.4704 20.29C14.7849 20.2305 15.0784 20.0467 15.2589 19.781C15.3784 19.5887 15.4509 19.3475 15.3882 19.1235C15.3392 18.8522 15.1497 18.6245 14.9212 18.4797C14.6267 18.285 14.2544 18.2305 13.9104 18.2905Z"
          fill="white"
        />
      </g>
      <defs>
        <linearGradient
          id="fold-session-grad"
          x1="21"
          y1="0"
          x2="30.0865"
          y2="30.0054"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#41DFFF" />
          <stop offset="1" stopColor="#7F3BF5" />
        </linearGradient>
        <clipPath id="fold-session-clip">
          <rect width="20" height="20" fill="white" transform="translate(6 6)" />
        </clipPath>
      </defs>
    </svg>
  );
}
