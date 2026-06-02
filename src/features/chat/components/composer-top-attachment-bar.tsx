import { X } from "lucide-react";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { formatFileSize } from "@/features/chat/file-preview/config";
import {
  extOfName,
  isImageMime,
  isVideoMime,
  type TopAttachmentItem,
} from "@/features/chat/lib/composer-files";

interface ComposerTopAttachmentBarProps {
  items: TopAttachmentItem[];
  onRemove: (id: string) => void;
}

/**
 * 顶部附件区(对齐旧 dmworkbase .wk-messageinput-top-attachments):
 * 横向滚动卡片列表,每个卡片:[图片缩略 / 视频封面 / 文件 icon] + name + size + ✕ 移除。
 *
 * 仅 upload / drag 路径 + paste 非图走这里;paste 图片走 editor inline AttachmentNode。
 */
export function ComposerTopAttachmentBar({ items, onRemove }: ComposerTopAttachmentBarProps) {
  if (items.length === 0) return null;
  return (
    <div className="mb-2 max-w-full overflow-x-auto">
      <div className="flex items-center gap-2">
        {items.map((item) => {
          const isImage = isImageMime(item.type, item.name) && !!item.previewUrl;
          const isVideo = isVideoMime(item.type, item.name) && !!item.previewUrl;
          return (
            <div
              key={item.id}
              className="flex shrink-0 items-center gap-2 rounded-md border border-border-default/60 bg-bg-elevated p-2"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded">
                {isImage ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : isVideo ? (
                  <img
                    src={item.previewUrl}
                    alt="video cover"
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <FileTypeIcon extension={extOfName(item.name)} size={36} />
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="max-w-[140px] truncate text-[12px] text-text-primary"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    title="移除"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
                  >
                    <X size={12} />
                  </button>
                </div>
                <span className="text-[10px] text-text-tertiary">{formatFileSize(item.size)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
