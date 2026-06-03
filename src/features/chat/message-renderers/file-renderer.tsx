import { type Message } from "wukongimjssdk";
import { type FileContent } from "@/features/base/im/file-content";
import { triggerDownload } from "@/features/chat/lib/file-download";
import { chatSidePanelActions } from "@/features/chat/stores/chat-side-panel";
import { getExtension } from "@/features/chat/file-preview/types";

interface FileRendererProps {
  message: Message;
}

/**
 * 文件消息卡片(1:1 复刻旧 dmworkbase Messages/File/FileCell + index.css):
 *
 * **卡片样式**(对齐 .wk-message-file):
 *   - flex / pad 10 12 / min-w 200 / max-w 280 / gap 12 / bg rgba(28,28,35,0.05) / r 8
 *   - hover bg rgba(28,28,35,0.08) + shadow 0 1px 3px / active bg rgba(28,28,35,0.12)
 *   - cursor pointer
 *
 * **结构**:
 *   - icon 40×40 SVG(FileTypeIcon 按 ext 分 PDF/DOC/XLS/PPT/ZIP/通用)
 *   - info: name(14/500 truncate rgba 0.8) + meta row(size 12 + ext 胶囊 10/600)
 *   - actions: 下载按钮 44×44 / 内嵌 18×18 SVG / hover bg
 *   - caption(可选,卡片下方 14 rgba 9,30,66,0.87)
 *
 * **交互**(对齐旧 handleDownload + 整卡 onClick → mittBus 'wk:file-preview'):
 *   - 整卡点击 → openFilePreview(打开右侧预览面板,跟 thread 互斥)
 *   - 下载按钮独立 onClick,stopPropagation 阻冒泡(下载,不触发预览)
 *   - 下载走 triggerDownload(跨域走后端预签名 URL)
 *
 * **未实现**(发送侧场景,P4 收消息流不涉及):
 *   - 上传进度条 / 失败重试(taskManager 订阅)
 *   - send 气泡变色(ext 胶囊绿 / brand color)
 *   - 激活态 isActive 高亮(正在预览的卡片描边)— FilePreviewInfo.messageId 字段
 *     已保留,后续在 renderer 内用 useStore 监听即可
 */
export function FileRenderer({ message }: FileRendererProps) {
  const content = message.content as FileContent;
  const name = content.name || "未知文件";
  const ext = getExtension(content.ext, content.name);
  const size = content.size ?? 0;
  const url = content.url || content.remoteUrl || "";
  const clickable = !!url;

  const onCardClick = () => {
    if (!clickable) return;
    chatSidePanelActions.openFilePreview({
      url,
      name,
      ext,
      size,
      messageId: message.messageID,
      messageSeq: message.messageSeq,
      fromUID: message.fromUID,
      conversationDigest: name,
      sourceChannelId: message.channel.channelID,
      sourceChannelType: message.channel.channelType,
    });
  };

  return (
    <div>
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onCardClick();
          }
        }}
        title={clickable ? "点击预览" : undefined}
        className={`flex max-w-[280px] min-w-[200px] items-center gap-3 rounded-lg bg-[rgba(28,28,35,0.05)] px-3 py-2.5 transition-[background-color,box-shadow] duration-150 ${
          clickable
            ? "cursor-pointer hover:bg-[rgba(28,28,35,0.08)] hover:shadow-[0_1px_3px_rgba(0,0,0,0.08)] active:bg-[rgba(28,28,35,0.12)]"
            : "cursor-default"
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <FileTypeIcon extension={ext} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div
            className="truncate text-[14px] leading-[1.4] font-medium text-[rgba(28,28,35,0.8)]"
            title={name}
          >
            {name}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[rgba(28,28,35,0.4)]">
            <span>{formatFileSize(size)}</span>
            {ext ? (
              <span className="rounded-[2px] bg-[rgba(99,102,241,0.1)] px-1 text-[10px] leading-[1.6] font-semibold text-[#1c1c23]">
                {ext.toUpperCase()}
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          title="下载"
          disabled={!clickable}
          onClick={(e) => {
            e.stopPropagation();
            if (clickable) void triggerDownload(url, name);
          }}
          className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-md text-[#1c1c23] transition-colors hover:bg-[rgba(99,102,241,0.1)] disabled:cursor-default disabled:opacity-40"
        >
          <DownloadIcon />
        </button>
      </div>
      {content.caption ? (
        <div className="px-2 pt-1 pb-2 text-[14px] leading-[1.4] break-words text-[rgba(9,30,66,0.87)]">
          {content.caption}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 文件类型 SVG icon(1:1 复刻旧 FileTypeIcon)— 40×40:
 *   - PDF 红 #EF4444 / DOC 蓝 #3B82F6 / XLS 绿 #22C55E / PPT 橙 #F97316
 *   - ZIP|RAR|7Z|TAR|GZ 黄 #EAB308 / 通用灰 #9CA3AF
 * 文件袋形 + 折角 + 内嵌白色 label 文字。
 */
function FileTypeIcon({ extension }: { extension: string }) {
  const ext = extension.toLowerCase();
  if (ext === "pdf") return <FileGlyph bg="#FEE2E2" body="#EF4444" corner="#FCA5A5" label="PDF" />;
  if (ext === "doc" || ext === "docx")
    return <FileGlyph bg="#DBEAFE" body="#3B82F6" corner="#93C5FD" label="DOC" />;
  if (ext === "xls" || ext === "xlsx")
    return <FileGlyph bg="#DCFCE7" body="#22C55E" corner="#86EFAC" label="XLS" />;
  if (ext === "ppt" || ext === "pptx")
    return <FileGlyph bg="#FFEDD5" body="#F97316" corner="#FDBA74" label="PPT" />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return <FileGlyph bg="#FEF9C3" body="#EAB308" corner="#FDE047" label="ZIP" />;
  // 通用文件 — 两条横线代替 label
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#F3F4F6" />
      <path
        d="M12 10C12 8.9 12.9 8 14 8H24L30 14V30C30 31.1 29.1 32 28 32H14C12.9 32 12 31.1 12 30V10Z"
        fill="#9CA3AF"
      />
      <path d="M24 8L30 14H26C24.9 14 24 13.1 24 12V8Z" fill="#D1D5DB" />
      <line
        x1="16"
        y1="20"
        x2="26"
        y2="20"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="24"
        x2="22"
        y2="24"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileGlyph({
  bg,
  body,
  corner,
  label,
}: {
  bg: string;
  body: string;
  corner: string;
  label: string;
}) {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill={bg} />
      <path
        d="M12 10C12 8.9 12.9 8 14 8H24L30 14V30C30 31.1 29.1 32 28 32H14C12.9 32 12 31.1 12 30V10Z"
        fill={body}
      />
      <path d="M24 8L30 14H26C24.9 14 24 13.1 24 12V8Z" fill={corner} />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fill="white"
        fontSize={label.length > 3 ? "6.5" : "7"}
        fontWeight="700"
        fontFamily="sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** 字节 → 人类可读(对齐旧 formatFileSize)。 */
function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
