/**
 * 文件类型 SVG icon — 抽出供 file-renderer(40px,卡片左侧)+
 * file-preview-panel header(20px,文件名前缀)共用(1:1 复刻旧 FileTypeIcon)。
 *
 * 6 种 ext 分色:
 *   PDF 红 / DOC 蓝 / XLS 绿 / PPT 橙 / ZIP 黄 / 通用灰
 * 文件袋形 + 折角 + 内嵌白色 label 文字(label 字号按 size 比例)。
 */

interface FileTypeIconProps {
  /** ext 串(不带点;大写小写都行,内部 toLowerCase)。 */
  extension: string;
  /** 渲染像素尺寸,默认 40。20 用于 header,40 用于卡片。 */
  size?: number;
}

export function FileTypeIcon({ extension, size = 40 }: FileTypeIconProps) {
  const ext = extension.toLowerCase();
  if (ext === "pdf")
    return <FileGlyph bg="#FEE2E2" body="#EF4444" corner="#FCA5A5" label="PDF" size={size} />;
  if (ext === "doc" || ext === "docx")
    return <FileGlyph bg="#DBEAFE" body="#3B82F6" corner="#93C5FD" label="DOC" size={size} />;
  if (ext === "xls" || ext === "xlsx")
    return <FileGlyph bg="#DCFCE7" body="#22C55E" corner="#86EFAC" label="XLS" size={size} />;
  if (ext === "ppt" || ext === "pptx")
    return <FileGlyph bg="#FFEDD5" body="#F97316" corner="#FDBA74" label="PPT" size={size} />;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext))
    return <FileGlyph bg="#FEF9C3" body="#EAB308" corner="#FDE047" label="ZIP" size={size} />;
  return <FileGlyphPlain size={size} />;
}

function FileGlyph({
  bg,
  body,
  corner,
  label,
  size,
}: {
  bg: string;
  body: string;
  corner: string;
  label: string;
  size: number;
}) {
  // viewBox 固定 40,fontSize 在 viewBox 坐标系内为常数(label 长 4 字略缩),
  // size 仅决定 SVG 外框像素;SVG 内部坐标按 viewBox 自动缩放。
  const fs = label.length > 3 ? 6.5 : 7;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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
        fontSize={fs}
        fontWeight="700"
        fontFamily="sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

function FileGlyphPlain({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
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
