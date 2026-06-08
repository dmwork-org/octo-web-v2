import { X } from "lucide-react";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { formatFileSize } from "@/features/chat/file-preview/config";
import {
  extOfName,
  isImageMime,
  isVideoMime,
  type TopAttachmentItem,
} from "@/features/chat/lib/composer-files";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/use-t";

interface ComposerTopAttachmentBarProps {
  items: TopAttachmentItem[];
  onRemove: (id: string) => void;
}

/**
 * 顶部附件区(1:1 对齐旧 dmworkbase .wk-messageinput-top-attachments + .wk-attachment-node-card)。
 */
export function ComposerTopAttachmentBar({ items, onRemove }: ComposerTopAttachmentBarProps) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="mb-2 w-full overflow-hidden">
      <div className="composer-top-attachments-scroll flex flex-row gap-2 overflow-x-auto overflow-y-hidden py-1">
        {items.map((item) => {
          const isImage = isImageMime(item.type, item.name) && !!item.previewUrl;
          const isVideo = isVideoMime(item.type, item.name) && !!item.previewUrl;
          return (
            <div
              key={item.id}
              className="relative box-border flex h-14 w-56 shrink-0 flex-row items-start gap-2 rounded-md bg-bg-elevated py-1 pr-3 pl-1"
            >
              <div className="flex h-12 w-12 min-w-12 shrink-0 items-center justify-center">
                {isImage ? (
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    draggable={false}
                    className="h-12 w-12 rounded-sm object-cover"
                  />
                ) : isVideo ? (
                  <div className="relative h-12 w-12 overflow-hidden rounded-sm">
                    <img
                      src={item.previewUrl}
                      alt="video cover"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-90 drop-shadow"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                ) : (
                  <FileTypeIcon extension={extOfName(item.name)} size={48} />
                )}
              </div>
              <div className="mt-2 flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex flex-row items-center gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-[14px] leading-5 font-normal text-text-primary"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={t("composerAttachment.remove")}
                        className="flex h-4 w-4 shrink-0 items-center justify-center bg-transparent p-0 text-text-tertiary transition-colors hover:text-text-primary"
                      >
                        <X size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("composerAttachment.remove")}</TooltipContent>
                  </Tooltip>
                </div>
                <span className="text-[14px] leading-5 text-text-tertiary">
                  {formatFileSize(item.size)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
