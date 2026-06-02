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

// 编辑器内附件节点的渲染体(图片直接缩略图;视频/文件渲染卡片 + 移除按钮)。
// 1:1 对齐旧 dmworkbase AttachmentNode AttachmentNodeView。
//
// 单独成文件以满足 react-refresh/only-export-components:.tsx 只 export 该组件,
// AttachmentNode 常量放 .ts 兄弟文件,通过 import 这个 view 完成 NodeView 绑定。
export function ComposerAttachmentView(props: ReactNodeViewProps<HTMLElement>) {
  const { node, deleteNode, selected } = props;
  const attrs = node.attrs as unknown as AttachmentAttributes;
  const { name, size, type, previewUrl } = attrs;
  const isImg = isImageMime(type, name) && !!previewUrl;
  const isVid = isVideoMime(type, name);

  if (isImg) {
    return (
      <NodeViewWrapper
        data-type="attachment"
        className={`mx-0.5 inline-block overflow-hidden rounded-md border align-middle ${
          selected ? "border-brand" : "border-border-default/60"
        }`}
      >
        <img
          src={previewUrl}
          alt={name}
          draggable={false}
          className="block max-h-[100px] max-w-[180px] object-contain"
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-type="attachment"
      className={`my-1 inline-flex items-center gap-2 rounded-md border bg-bg-elevated p-2 align-middle ${
        selected ? "border-brand" : "border-border-default/60"
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
        {isVid && previewUrl ? (
          <img
            src={previewUrl}
            alt="video cover"
            draggable={false}
            className="h-full w-full rounded object-cover"
          />
        ) : (
          <FileTypeIcon extension={extOfName(name)} size={32} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="max-w-[140px] truncate text-[12px] text-text-primary" title={name}>
            {name}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteNode();
            }}
            title="移除"
            contentEditable={false}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
          >
            <X size={12} />
          </button>
        </div>
        <span className="text-[10px] text-text-tertiary">{formatFileSize(size)}</span>
      </div>
    </NodeViewWrapper>
  );
}
