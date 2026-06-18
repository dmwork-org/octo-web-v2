import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/react";
import { useStore } from "@tanstack/react-store";
import type { Channel } from "wukongimjssdk";
import { toast } from "@/components/semi-bridge/toast";
import { imageBlockToPasteFile, type AddAttachment } from "@/features/chat/lib/rich-text-paste";
import {
  chatReeditRequestActions,
  chatReeditRequestStore,
  selectPendingReedit,
} from "@/features/chat/stores/chat-reedit-request";
import { formatFileSize } from "@/features/chat/file-preview/config";
import { t } from "@/lib/i18n/instance";

const MAX_REEDIT_FILE_BYTES = 100 * 1024 * 1024;

function normalizeMime(value: string | null | undefined): string {
  return (value || "").split(";")[0].trim().toLowerCase();
}

function safeFileName(name: string | undefined, fallback: string): string {
  const raw = (name || fallback).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 160);
  return raw || fallback;
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : null;
}

async function remoteFileToFile(input: {
  url: string;
  name: string;
  size?: number;
  mime?: string;
}): Promise<File | null> {
  if (!input.url) return null;
  if (input.size && input.size > MAX_REEDIT_FILE_BYTES) return null;
  try {
    const response = await fetch(input.url, { mode: "cors", credentials: "omit" });
    if (!response.ok) return null;
    const contentLength = parseContentLength(response.headers.get("Content-Length"));
    if (contentLength !== null && contentLength > MAX_REEDIT_FILE_BYTES) return null;
    const blob = await response.blob();
    if (blob.size > MAX_REEDIT_FILE_BYTES) return null;
    return new File([blob], safeFileName(input.name, "file"), {
      type: normalizeMime(blob.type || input.mime || response.headers.get("Content-Type")),
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

export function useApplyReeditRequest(
  channel: Channel,
  editor: Editor | null,
  addAttachment: AddAttachment,
): void {
  const pending = useStore(chatReeditRequestStore, (s) => selectPendingReedit(s, channel));
  const addAttachmentRef = useRef(addAttachment);
  addAttachmentRef.current = addAttachment;

  useEffect(() => {
    if (!pending || !editor) return;
    let cancelled = false;
    const apply = async () => {
      for (const block of pending.blocks) {
        if (cancelled) return;
        if (block.type === "content") {
          if (block.content.length > 0) {
            editor.chain().focus("end").insertContent(block.content).run();
          }
          continue;
        }
        if (block.type === "image") {
          const file = await imageBlockToPasteFile(block);
          if (!file) {
            editor.chain().focus("end").insertContent(t("message.digest.image")).run();
            toast.error(t("revoke.reeditAttachmentFailed"));
            continue;
          }
          await addAttachmentRef.current([file], "paste", editor);
          continue;
        }
        const file = await remoteFileToFile(block);
        if (!file) {
          toast.error(
            t("revoke.reeditFileFailed", {
              values: { name: block.name, max: formatFileSize(MAX_REEDIT_FILE_BYTES) },
            }),
          );
          continue;
        }
        await addAttachmentRef.current([file], "upload", editor);
      }
    };
    void apply().finally(() => {
      if (!cancelled) chatReeditRequestActions.consume(channel);
    });
    return () => {
      cancelled = true;
    };
  }, [pending, editor, channel]);
}
