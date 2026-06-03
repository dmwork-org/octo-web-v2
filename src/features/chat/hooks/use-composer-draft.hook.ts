import { useEffect, useRef } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import type { Channel } from "wukongimjssdk";

const DRAFT_PREFIX = "octo:chat:draft:";
/** 不可见字符(zero-width / BOM / soft hyphen 等)— 跟旧 stripInvisibleChars 同源。 */
const INVISIBLE_CHARS_RE =
  /\u200B|\u200C|\u200D|\u200E|\u200F|\uFEFF|\u00AD|\u2060|\u2061|\u2062|\u2063|\u2064|\u034F|\u061C|\u180E/g;

function draftKey(channel: Channel): string {
  return `${DRAFT_PREFIX}${channel.channelID}_${channel.channelType}`;
}

function readDraft(channel: Channel): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(draftKey(channel));
  } catch {
    return null;
  }
}

function writeDraft(channel: Channel, text: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(channel), text);
  } catch {
    // 私密模式 / quota 等错误静默
  }
}

function clearDraftKey(channel: Channel): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(channel));
  } catch {
    // ignore
  }
}

interface MentionAttrs {
  id?: string;
  label?: string;
}

interface AnyNode {
  type?: string;
  text?: string;
  attrs?: MentionAttrs;
  content?: AnyNode[];
}

/**
 * 把 editor 序列化成草稿文本(1:1 对齐旧 dmworkbase MessageInput extractMentionsFromEditor):
 *
 * - text 节点 → 原文
 * - mention 节点 → `@[uid:label]`(还原时再解析回 mention node)
 * - hardBreak → \n
 * - **attachment / image / video 等 atom inline node 自然丢弃**(traverse 不识别;
 *   老仓同款行为 — 草稿只持久化"文本 + mention",附件 / 编辑器内 inline 图片不入草稿)
 * - 段落之间 \n 分隔
 * - 末尾 stripInvisibleChars(zero-width / BOM)
 */
function serializeDraft(editor: Editor): string {
  const json = editor.getJSON() as JSONContent;
  let result = "";

  const traverse = (node: AnyNode): void => {
    if (node.type === "text") {
      result += node.text ?? "";
    } else if (node.type === "mention") {
      const uid = node.attrs?.id ?? "";
      const label = node.attrs?.label ?? "";
      result += `@[${uid}:${label}]`;
    } else if (node.type === "hardBreak") {
      result += "\n";
    } else if (node.content) {
      // 段落 / 容器类节点 — 递归 children
      node.content.forEach(traverse);
    }
    // atom inline node(attachment / image / ...)— 不 traverse,自然丢弃
  };

  if (json.content) {
    (json.content as AnyNode[]).forEach((block, i) => {
      if (i > 0) result += "\n";
      traverse(block);
    });
  }
  return result.replace(INVISIBLE_CHARS_RE, "");
}

/**
 * 反序列化草稿文本为 Tiptap 文档(1:1 对齐旧 parseDraftToContent):
 * 每行一个 paragraph;`@[uid:label]` regex match 还原成 mention node;其余文本直接 text。
 * uid 不含 `]` 或 `:`,label 不含 `]`(老仓 regex 同款)。
 */
function deserializeDraft(text: string): JSONContent {
  const lines = text.split("\n");
  const paragraphs = lines.map((line) => {
    const nodes: AnyNode[] = [];
    const regex = /@\[([^\]:]+):([^\]]+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const uid = match[1];
      const label = match[2];
      const matchStart = match.index;
      if (matchStart > lastIndex) {
        nodes.push({ type: "text", text: line.slice(lastIndex, matchStart) });
      }
      nodes.push({ type: "mention", attrs: { id: uid, label } });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      nodes.push({ type: "text", text: line.slice(lastIndex) });
    }
    return { type: "paragraph", content: nodes };
  });
  return { type: "doc", content: paragraphs } as JSONContent;
}

/** 草稿非空判定:序列化后 trim 不为空(避免空文本反复存)。 */
function isEmptyDraftText(text: string): boolean {
  return text.trim() === "";
}

/**
 * Composer 草稿恢复(per-channel localStorage)— 1:1 对齐旧 dmworkbase
 * Conversation.markConversationExtra + MessageInput restoreDraft 行为。
 *
 * 调用方:
 *   const { clearDraft: drop } = useComposerDraft(editor, channel);
 *   sendText 成功后 → drop()
 *
 * **持久化范围**(与老仓一致):
 * - text + mention + hardBreak(换行)→ `@[uid:label]` 文本格式
 * - **attachment / 编辑器内 inline 图片不入草稿**(File 引用失效 + 后端 conversationExtra
 *   也只存 text;老仓 extractMentionsFromEditor 不 traverse atom inline node)
 * - reply / 顶部附件区不持久化(reply 跟随 chatReply store,顶部附件 File map 内存态)
 *
 * 行为:
 * - channel 切换 → 先把当前 editor 序列化成 `@[uid:label]` 文本存到旧 channel 的 draftKey
 *   (空文本不写,避免误覆盖);然后从新 channel 的 draftKey 读 → setContent(emitUpdate=false
 *   防止恢复时触发 onUpdate → slash menu 误闪)
 * - 编辑器为空时切走 → clearDraftKey(已发送的不会留草稿)
 *
 * 设计取舍:不用 debounce 写,channel 切换才写一次。同一 channel 输入到 90% 时崩浏览器
 * 会丢草稿(旧 textarea 也一样);真要实时持久化需 onUpdate 高频写,代价 IO/JSON 序列化。
 *
 * 旧仓存到后端 conversationExtra(跨设备),新仓暂走 localStorage(单设备)— 后端 API
 * 待补,现阶段语义对齐 95%。
 */
export function useComposerDraft(
  editor: Editor | null,
  channel: Channel,
): { clearDraft: () => void } {
  // 上一个 channel 的引用,用于"切换前先 save 旧的"
  const prevChannelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!editor) return;
    // 1) 切换前 save 旧 channel(prevChannelRef 非空 且 != new)
    const prev = prevChannelRef.current;
    if (
      prev &&
      (prev.channelID !== channel.channelID || prev.channelType !== channel.channelType)
    ) {
      const text = serializeDraft(editor);
      if (isEmptyDraftText(text)) clearDraftKey(prev);
      else writeDraft(prev, text);
    }
    prevChannelRef.current = channel;

    // 2) 从新 channel 读草稿
    const draft = readDraft(channel);
    if (draft && !isEmptyDraftText(draft)) {
      try {
        const doc = deserializeDraft(draft);
        editor.commands.setContent(doc, { emitUpdate: false });
      } catch {
        // 损坏的 draft → 清掉,空 editor
        clearDraftKey(channel);
        editor.commands.clearContent();
      }
    } else {
      editor.commands.clearContent();
    }
  }, [editor, channel]);

  return {
    clearDraft: () => clearDraftKey(channel),
  };
}
