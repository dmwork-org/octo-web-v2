import { useEffect, useRef } from "react";
import type { Editor, JSONContent } from "@tiptap/react";
import type { Channel } from "wukongimjssdk";
import { isBroadcastSentinelUid } from "@/features/base/lib/mention-three-state";
import { chatDraftActions } from "@/features/chat/stores/chat-draft";

/**
 * 不可见字符(zero-width / BOM / soft hyphen 等)— 跟旧 stripInvisibleChars 同源。
 * 用 alternation 而不是 character class,避免 oxlint no-misleading-character-class
 * 把 ZWJ / 双向控制符识别为组合字符序列。
 */
const INVISIBLE_CHARS_RE = /​|‌|‍|‎|‏|﻿|­|⁠|⁡|⁢|⁣|⁤|͏|؜|᠎/g;

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
      if (isBroadcastSentinelUid(uid)) {
        nodes.push({ type: "text", text: `@${label}` });
      } else {
        nodes.push({ type: "mention", attrs: { id: uid, label } });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      nodes.push({ type: "text", text: line.slice(lastIndex) });
    }
    return { type: "paragraph", content: nodes };
  });
  return { type: "doc", content: paragraphs } as JSONContent;
}

/**
 * Composer 草稿恢复(per-channel)— 1:1 对齐旧 dmworkbase
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
 * **存储**(经 [chat-draft.ts](../stores/chat-draft.ts) store + localStorage 双写):
 * - composer mount → 从 store 读 → setContent
 * - editor update → 即时序列化 editor → 写 store(刷新 / 关闭页面不依赖 cleanup)
 * - composer unmount(channel 切换 by key 重建)→ effect cleanup 再兜底写一次
 *
 * **关键**:Composer 是 `<Composer key={channelKey} />` 重建,所以 channel 切换走
 * unmount → mount 而不是同 hook 跑 deps change。cleanup 函数里 capture 的 editor +
 * channel 都是旧的(指针不变),可以安全序列化。
 *
 * **conversation-list 联动**:store 更新即 useStore 重渲,会话项右侧出现红色 [草稿]
 * label(对齐旧 wk-reminder.draft 显示)。
 */
export function useComposerDraft(
  editor: Editor | null,
  channel: Channel,
): { clearDraft: () => void } {
  // capture 当前 channel,cleanup 用(channel 是 prop,deps 变化 cleanup 时仍持有旧值)
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const lastPersistedRef = useRef<string>("");

  useEffect(() => {
    if (!editor) return;
    // mount:从 store 读草稿
    const draft = chatDraftActions.get(channel);
    if (draft && draft.trim() !== "") {
      try {
        const doc = deserializeDraft(draft);
        editor.commands.setContent(doc, { emitUpdate: false });
        lastPersistedRef.current = draft;
      } catch {
        // 损坏的 draft → 清掉,空 editor
        chatDraftActions.remove(channel);
        editor.commands.clearContent();
        lastPersistedRef.current = "";
      }
    } else {
      editor.commands.clearContent();
      lastPersistedRef.current = "";
    }

    const persistCurrentDraft = () => {
      const text = serializeDraft(editor);
      if (text === lastPersistedRef.current) return;
      lastPersistedRef.current = text;
      if (text.trim() === "") chatDraftActions.remove(channel);
      else chatDraftActions.set(channel, text);
    };

    // 输入过程即时落盘,确保浏览器刷新 / 关闭时不会依赖 React cleanup。
    editor.on("update", persistCurrentDraft);

    // unmount(channel 切走 by key 重建)→ 再兜底序列化一次。
    return () => {
      editor.off("update", persistCurrentDraft);
      // editor 在此 closure 中是旧 instance 的引用;destroy 前调 getJSON 仍可用
      persistCurrentDraft();
    };
  }, [editor, channel]);

  return {
    clearDraft: () => {
      lastPersistedRef.current = "";
      chatDraftActions.remove(channelRef.current);
    },
  };
}
