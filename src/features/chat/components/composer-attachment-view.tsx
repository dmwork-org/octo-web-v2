import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import { FileTypeIcon } from "@/features/chat/file-preview/file-type-icon";
import { formatFileSize } from "@/features/chat/file-preview/config";
import {
  isImageMime,
  isVideoMime,
  extOfName,
  type AttachmentAttributes,
} from "@/features/chat/lib/composer-files";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/use-t";

// 编辑器内附件节点的渲染体 — 1:1 对齐旧 dmworkbase AttachmentNode + index.css。
export function ComposerAttachmentView(props: ReactNodeViewProps<HTMLElement>) {
  const t = useT();
  const { node, deleteNode, selected } = props;
  const attrs = node.attrs as unknown as AttachmentAttributes;
  const { name, size, type, previewUrl } = attrs;
  const isImg = isImageMime(type, name) && !!previewUrl;
  const isVid = isVideoMime(type, name);

  if (isImg) {
    return (
      <NodeViewWrapper
        data-type="attachment"
        className="mr-1 inline-flex p-[2px] align-bottom select-none"
      >
        <img
          src={previewUrl}
          alt={name}
          draggable={false}
          className={`block max-h-[76px] max-w-[76px] object-contain ${
            selected ? "outline outline-2 outline-brand" : ""
          }`}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-type="attachment"
      className="mr-1 inline-flex p-[2px] align-bottom select-none"
    >
      <div
        className={`box-border flex h-14 w-56 flex-row items-start gap-2 rounded-md bg-bg-elevated py-1 pr-3 pl-1 ${
          selected ? "outline outline-2 outline-brand" : ""
        }`}
      >
        <div className="flex h-12 w-12 min-w-12 shrink-0 items-center justify-center">
          {isVid && previewUrl ? (
            <div className="relative h-12 w-12 overflow-hidden rounded-sm">
              <img
                src={previewUrl}
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
            <FileTypeIcon extension={extOfName(name)} size={48} />
          )}
        </div>
        <div className="mt-2 flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-row items-center gap-2">
            <span
              className="min-w-0 flex-1 truncate text-[14px] leading-5 font-normal text-text-primary"
              title={name}
            >
              {name}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteNode();
                  }}
                  aria-label={t("composerAttachment.remove")}
                  contentEditable={false}
                  className="flex h-4 w-4 shrink-0 items-center justify-center bg-transparent p-0 text-text-tertiary transition-colors hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("composerAttachment.remove")}</TooltipContent>
            </Tooltip>
          </div>
          <span className="text-[14px] leading-5 text-text-tertiary">{formatFileSize(size)}</span>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
