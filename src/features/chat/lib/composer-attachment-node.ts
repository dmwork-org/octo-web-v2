import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ComposerAttachmentView } from "@/features/chat/components/composer-attachment-view";
import { t } from "@/lib/i18n/instance";

// inline atom TipTap Node — 1:1 对齐旧 dmworkbase AttachmentNode。
//
// group=inline,inline=true,atom=true(不可编辑内部),draggable=true。
// 粘贴的图片用此 node 直接进 editor;文本块外通过 extractOrderedBlocks 按文档顺序拆开发送。
// .ts 而非 .tsx,使其不受 react-refresh/only-export-components 限制(NodeView 组件在
// 兄弟文件 composer-attachment-view.tsx)。
export const AttachmentNode = Node.create({
  name: "attachment",
  group: "inline",
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: null },
      name: { default: t("composerAttachment.defaultName") },
      size: { default: 0 },
      type: { default: "application/octet-stream" },
      previewUrl: { default: null },
      source: { default: "upload" },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-type="attachment"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "attachment" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ComposerAttachmentView);
  },
});
