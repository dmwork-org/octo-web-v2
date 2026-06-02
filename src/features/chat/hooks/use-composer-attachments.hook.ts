import { useCallback, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import {
  generateVideoCover,
  isImageMime,
  isVideoMime,
  makeAttachmentId,
  type AttachmentAttributes,
  type TopAttachmentItem,
} from "@/features/chat/lib/composer-files";

/** 编辑器内按顺序拆出的发送块。 */
export type OrderedBlock =
  | { type: "text"; text: string; uids: string[]; all: boolean }
  | { type: "image"; file: File }
  | { type: "file"; file: File };

export interface UseComposerAttachmentsReturn {
  topAttachments: TopAttachmentItem[];
  /**
   * 加附件(自动分流):
   *   source="paste" + image → 插入 editor inline AttachmentNode + 缩略图
   *   其它(paste 非图 / drag 拖入 / 上传按钮)→ 顶部附件区卡片
   */
  addAttachments: (
    files: File[],
    source: "paste" | "upload",
    editor: Editor | null,
  ) => Promise<void>;
  removeTopAttachment: (id: string) => void;
  /**
   * 按文档顺序提取发送块(对齐旧 extractOrderedBlocks)。
   * 文本段和 inline attachment 交替拆分,连续段落合并(\n 分隔)。
   * mention node 解析为 uids/all。
   */
  extractOrderedBlocks: (editor: Editor) => OrderedBlock[];
  /** 顶部 + 编辑器内是否有任意附件(给 send 按钮 / send 路径分流判用)。 */
  hasAnyAttachment: (editor: Editor | null) => boolean;
  /** 发送成功后清:revoke 所有 ObjectURL,清空顶部 + 内部 File map。editor 内 attachment node 由调用方 clearContent 顺带清。 */
  clearAll: () => void;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

function inlineToText(node: TipTapNode, uids: string[], allRef: { v: boolean }): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") {
    const id = node.attrs?.id as string | undefined;
    const label = (node.attrs?.label as string | undefined) ?? id ?? "";
    if (id === "@all") {
      allRef.v = true;
      return "@所有人";
    }
    if (id) {
      uids.push(id);
      return `@${label}`;
    }
    return "";
  }
  if (node.type === "hardBreak") return "\n";
  return "";
}

function hasAttachmentNode(json: JSONContent): boolean {
  if (json.type === "attachment") return true;
  if (!json.content) return false;
  for (const c of json.content) {
    if (hasAttachmentNode(c)) return true;
  }
  return false;
}

/**
 * Composer 附件状态 hook(对齐旧 dmworkbase MessageInput 的 addAttachment / topAttachments
 * / attachmentFilesRef / extractOrderedBlocks 一整套)。
 *
 * - paste 图片 → inline AttachmentNode(编辑区显缩略图,可拖拽);File 实体存 ref Map
 * - 其他(paste 非图 / drag 拖入 / 上传按钮) → 顶部附件卡片
 * - send 时:editor 内部走 extractOrderedBlocks(text 段 + image 块交替);顶部独立发
 * - clearAll:revoke ObjectURL + 清 state + 清 File map
 */
export function useComposerAttachments(): UseComposerAttachmentsReturn {
  const [topAttachments, setTopAttachments] = useState<TopAttachmentItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
  // 跟踪所有 ObjectURL,clearAll 时一次 revoke,防 memory leak
  const objectUrlsRef = useRef<string[]>([]);

  const addAttachments = useCallback(
    async (files: File[], source: "paste" | "upload", editor: Editor | null) => {
      for (const file of files) {
        const id = makeAttachmentId(file);
        const isImage = isImageMime(file.type, file.name);
        const isVideo = isVideoMime(file.type, file.name);

        if (source === "paste" && isImage && editor) {
          const previewUrl = URL.createObjectURL(file);
          objectUrlsRef.current.push(previewUrl);
          filesRef.current.set(id, file);
          const attrs: AttachmentAttributes = {
            id,
            name: file.name,
            size: file.size,
            type: file.type,
            previewUrl,
            source: "paste",
          };
          editor.chain().focus().insertContent({ type: "attachment", attrs }).run();
          continue;
        }

        // upload 路径 / paste 非图:全部进顶部
        let previewUrl: string | undefined;
        if (isImage) {
          previewUrl = URL.createObjectURL(file);
          objectUrlsRef.current.push(previewUrl);
        } else if (isVideo) {
          previewUrl = await generateVideoCover(file);
          // dataURL 不需 revoke
        }

        const item: TopAttachmentItem = {
          id,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          previewUrl,
        };
        setTopAttachments((prev) => [...prev, item]);
      }
    },
    [],
  );

  const removeTopAttachment = useCallback((id: string) => {
    setTopAttachments((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const extractOrderedBlocks = useCallback((editor: Editor): OrderedBlock[] => {
    const json = editor.getJSON() as JSONContent;
    if (!json.content) return [];
    const blocks: OrderedBlock[] = [];
    let pendingText = "";
    let pendingUids: string[] = [];
    const allRef = { v: false };

    const flushText = () => {
      const text = pendingText.trim();
      if (text) {
        blocks.push({ type: "text", text, uids: pendingUids, all: allRef.v });
      }
      pendingText = "";
      pendingUids = [];
      allRef.v = false;
    };

    for (let i = 0; i < json.content.length; i++) {
      const topNode = json.content[i] as TipTapNode;
      // 段落间用 \n 分隔(已经累积 text 时才追加)
      if (pendingText) pendingText += "\n";
      const children = topNode.content ?? [];
      for (const child of children) {
        if (child.type === "attachment" && child.attrs) {
          const attrs = child.attrs as unknown as AttachmentAttributes;
          const file = filesRef.current.get(attrs.id);
          if (!file) continue;
          // 遇到 inline 附件,先冲刷前面文本
          flushText();
          const isImage = isImageMime(file.type, file.name);
          blocks.push({ type: isImage ? "image" : "file", file });
        } else {
          pendingText += inlineToText(child, pendingUids, allRef);
        }
      }
    }
    flushText();
    return blocks;
  }, []);

  const hasAnyAttachment = useCallback(
    (editor: Editor | null): boolean => {
      if (topAttachments.length > 0) return true;
      if (!editor) return false;
      return hasAttachmentNode(editor.getJSON() as JSONContent);
    },
    [topAttachments.length],
  );

  const clearAll = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
    filesRef.current.clear();
    setTopAttachments([]);
  }, []);

  return {
    topAttachments,
    addAttachments,
    removeTopAttachment,
    extractOrderedBlocks,
    hasAnyAttachment,
    clearAll,
  };
}
