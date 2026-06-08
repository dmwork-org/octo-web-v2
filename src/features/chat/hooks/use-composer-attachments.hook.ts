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
import {
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
  MENTION_UID_LEGACY_ALL,
  MENTION_UID_OLD_ALL_ALIAS,
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
} from "@/features/base/lib/mention-three-state";

/** 编辑器内按顺序拆出的发送块。 */
export type OrderedBlock =
  | {
      type: "text";
      text: string;
      uids: string[];
      /** legacy "@所有人"(server 端会 rewrite 成 humans=1) */
      all: boolean;
      /** 新三态:"@所有人"(纯人,不含 AI) */
      humans: boolean;
      /** 新三态:"@所有AI"(全部 bot) */
      ais: boolean;
    }
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
   * mention node 解析为 uids / all / humans / ais 三态。
   */
  extractOrderedBlocks: (editor: Editor) => OrderedBlock[];
  /** 顶部 + 编辑器内是否有任意附件(给 send 按钮 / send 路径分流判用)。 */
  hasAnyAttachment: (editor: Editor | null) => boolean;
  /** 发送成功后清:revoke 所有 ObjectURL,清空顶部 + 内部 File map。 */
  clearAll: () => void;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

interface MentionFlags {
  all: boolean;
  humans: boolean;
  ais: boolean;
}

/**
 * Tiptap 块级节点名集合(对齐上游 `006b2411` TIPTAP_BLOCK_TYPES)。
 * 用于 extractOrderedBlocks 递归遍历时,在块级 sibling 之间插入 "\n"。
 *
 * 本仓 composer 关掉了 bulletList/orderedList extension,但 paste 富文本(如 Word/网页)
 * 时 Tiptap default schema 仍可能产出 orderedList → listItem → paragraph → text
 * 嵌套结构。旧版 extractOrderedBlocks 平铺遍历对 listItem 调 inlineToText 返回 ""
 * 导致列表内容静默丢失。递归遍历可下探任意深度容器。
 */
const TIPTAP_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "codeBlock",
  "orderedList",
  "bulletList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "horizontalRule",
]);

function inlineToText(node: TipTapNode, uids: string[], flags: MentionFlags): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "mention") {
    const id = node.attrs?.id as string | undefined;
    const label = (node.attrs?.label as string | undefined) ?? id ?? "";
    if (!id) return "";
    if (id === MENTION_UID_AIS) {
      flags.ais = true;
      return `@${MENTION_LABEL_AIS}`;
    }
    if (id === MENTION_UID_HUMANS) {
      flags.humans = true;
      return `@${MENTION_LABEL_HUMANS}`;
    }
    if (id === MENTION_UID_LEGACY_ALL || id === MENTION_UID_OLD_ALL_ALIAS) {
      flags.all = true;
      return `@${MENTION_LABEL_HUMANS}`;
    }
    uids.push(id);
    return `@${label}`;
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
 *   mention 三态(all/humans/ais)按文档顺序拆,与文本段对应
 * - clearAll:revoke ObjectURL + 清 state + 清 File map
 */
export function useComposerAttachments(): UseComposerAttachmentsReturn {
  const [topAttachments, setTopAttachments] = useState<TopAttachmentItem[]>([]);
  const filesRef = useRef<Map<string, File>>(new Map());
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

        let previewUrl: string | undefined;
        if (isImage) {
          previewUrl = URL.createObjectURL(file);
          objectUrlsRef.current.push(previewUrl);
        } else if (isVideo) {
          previewUrl = await generateVideoCover(file);
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
    let pendingFlags: MentionFlags = { all: false, humans: false, ais: false };

    const flushText = () => {
      const text = pendingText.trim();
      if (text) {
        blocks.push({
          type: "text",
          text,
          uids: pendingUids,
          all: pendingFlags.all,
          humans: pendingFlags.humans,
          ais: pendingFlags.ais,
        });
      }
      pendingText = "";
      pendingUids = [];
      pendingFlags = { all: false, humans: false, ais: false };
    };

    /**
     * 递归遍历节点(对齐上游 `006b2411` processNode):
     * - attachment 是终止节点,flush 当前文本再 push 独立块
     * - inline 节点(text/mention/hardBreak)累积到 pendingText
     * - 容器节点(orderedList/listItem/paragraph 等)递归下探,sibling 间加 "\n"
     */
    const processNode = (node: TipTapNode): void => {
      if (node.type === "attachment" && node.attrs) {
        const attrs = node.attrs as unknown as AttachmentAttributes;
        const file = filesRef.current.get(attrs.id);
        if (!file) return;
        flushText();
        const isImage = isImageMime(file.type, file.name);
        blocks.push({ type: isImage ? "image" : "file", file });
        return;
      }
      if (node.type === "text" || node.type === "mention" || node.type === "hardBreak") {
        pendingText += inlineToText(node, pendingUids, pendingFlags);
        return;
      }
      if (node.content) {
        for (let i = 0; i < node.content.length; i++) {
          const child = node.content[i];
          if (i > 0 && TIPTAP_BLOCK_TYPES.has(child.type)) {
            pendingText += "\n";
          }
          processNode(child);
        }
      }
    };

    for (let i = 0; i < json.content.length; i++) {
      if (i > 0) pendingText += "\n";
      processNode(json.content[i] as TipTapNode);
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
