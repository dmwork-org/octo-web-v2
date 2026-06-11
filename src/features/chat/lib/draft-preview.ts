import {
  MENTION_LABEL_AIS,
  MENTION_LABEL_HUMANS,
  MENTION_UID_AIS,
  MENTION_UID_HUMANS,
  MENTION_UID_LEGACY_ALL,
} from "@/features/base/lib/mention-three-state";

/**
 * 把草稿文本里的 mention placeholder(`@[uid:label]`)渲染为可读形式
 * (对齐上游 30185565 / Utils/draftPreview.ts):
 *   - `@[-1:所有人]` / `@[-2:所有人]` → `@所有人`
 *   - `@[-3:所有AI]` → `@所有AI`
 *   - `@[u_abc:小明]` → `@小明`
 *
 * 用于 conversation-list 的草稿 preview。原始 `@[uid:label]` 串是
 * useComposerDraft 序列化时写入 chat-draft store 的格式,直接显示太丑。
 *
 * 健壮性:格式不对的 placeholder(缺 colon / 不闭合)按原样保留,不抛错。
 */
export function formatDraftPreview(draft: string): string {
  if (!draft) return "";

  let result = "";
  let index = 0;

  while (index < draft.length) {
    const start = draft.indexOf("@[", index);
    if (start === -1) {
      result += draft.slice(index);
      break;
    }

    result += draft.slice(index, start);

    const end = draft.indexOf("]", start + 2);
    if (end === -1) {
      result += draft.slice(start);
      break;
    }

    const markerBody = draft.slice(start + 2, end);
    const colon = markerBody.indexOf(":");
    if (colon <= 0 || colon === markerBody.length - 1) {
      result += draft.slice(start, end + 1);
      index = end + 1;
      continue;
    }

    const uid = markerBody.slice(0, colon);
    const label = markerBody.slice(colon + 1);

    if (uid === MENTION_UID_LEGACY_ALL || uid === MENTION_UID_HUMANS) {
      result += `@${MENTION_LABEL_HUMANS}`;
    } else if (uid === MENTION_UID_AIS) {
      result += `@${MENTION_LABEL_AIS}`;
    } else {
      result += `@${label}`;
    }

    index = end + 1;
  }

  return result;
}
