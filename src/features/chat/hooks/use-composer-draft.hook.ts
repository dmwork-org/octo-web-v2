import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import type { Channel } from "wukongimjssdk";

const DRAFT_PREFIX = "octo:chat:draft:";

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

function writeDraft(channel: Channel, json: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(channel), json);
  } catch {
    // 私密模式 / quota 等错误静默
  }
}

function clearDraft(channel: Channel): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(channel));
  } catch {
    // ignore
  }
}

/**
 * Composer 草稿恢复(K-3,per-channel localStorage):
 *
 * 调用方:
 *   const { clearDraft: drop } = useComposerDraft(editor, channel);
 *   sendText 成功后 → drop()
 *
 * 行为:
 * - channel 切换 → 先把当前 editor.getJSON() 写到旧 channel 的 draftKey
 *   (空文档不写,避免误覆盖);然后从新 channel 的 draftKey 读 → setContent
 * - 编辑器空时 unmount → 旧逻辑兜底 clear(已发送的不会留草稿)
 * - 仅 prosemirror JSON 序列化,reply 状态不持久化(reply 临时,切走应丢)
 *
 * 设计取舍:不用 debounce 写,channel 切换才写一次 — 用户在同一 channel 输入到 90%
 * 时崩浏览器会丢草稿,这点旧 textarea 实现也一样;真要持久化需 onUpdate 高频写。
 */
export function useComposerDraft(
  editor: Editor | null,
  channel: Channel,
): { clearDraft: () => void } {
  // 上一个 channel 的引用,用于"切换前先 save 旧的"
  const prevChannelRef = useRef<Channel | null>(null);

  useEffect(() => {
    if (!editor) return;
    // 切换前 save 旧 channel(prevChannelRef 非空 且 != new)
    const prev = prevChannelRef.current;
    if (
      prev &&
      (prev.channelID !== channel.channelID || prev.channelType !== channel.channelType)
    ) {
      const json = editor.getJSON();
      const isEmpty = !json.content || json.content.length === 0 || isEmptyDoc(json);
      if (isEmpty) clearDraft(prev);
      else writeDraft(prev, JSON.stringify(json));
    }
    prevChannelRef.current = channel;

    // 从新 channel 读草稿
    const draft = readDraft(channel);
    if (draft) {
      try {
        const json = JSON.parse(draft);
        editor.commands.setContent(json, { emitUpdate: false });
      } catch {
        // 损坏的 draft → 清掉
        clearDraft(channel);
        editor.commands.clearContent();
      }
    } else {
      editor.commands.clearContent();
    }
  }, [editor, channel]);

  return {
    clearDraft: () => clearDraft(channel),
  };
}

/**
 * 判定空文档(单个空段落):
 *   { type: "doc", content: [{ type: "paragraph" }] }
 * 不空就持久化,空就丢草稿(避免发送后残留空文档反复 setContent)。
 */
function isEmptyDoc(json: ReturnType<Editor["getJSON"]>): boolean {
  if (!json.content || json.content.length === 0) return true;
  if (json.content.length !== 1) return false;
  const only = json.content[0] as { type?: string; content?: unknown[] };
  if (only.type !== "paragraph") return false;
  return !only.content || only.content.length === 0;
}
