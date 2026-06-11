import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { ConversationTypingDigest } from "./conversation-typing-digest";
import { chatDraftActions, chatDraftStore } from "../stores/chat-draft";
import { i18n } from "../../../lib/i18n/instance";

const channel = new Channel("u-1", ChannelTypePerson);

function renderDigest(suppressDraft = false): string {
  return renderToStaticMarkup(
    <ConversationTypingDigest
      channel={channel}
      fallback="last message"
      suppressDraft={suppressDraft}
    />,
  );
}

describe("ConversationTypingDigest", () => {
  beforeEach(() => {
    i18n.setLocale("zh-CN", { notify: false, persist: false });
    chatDraftStore.setState(() => ({ map: new Map() }));
    chatDraftActions.set(channel, "hello draft");
  });

  it("shows draft preview for inactive conversations", () => {
    const html = renderDigest();

    expect(html).toContain("[草稿]");
    expect(html).toContain("hello draft");
    expect(html).not.toContain("last message");
  });

  it("falls back to last message for the active conversation", () => {
    const html = renderDigest(true);

    expect(html).not.toContain("[草稿]");
    expect(html).not.toContain("hello draft");
    expect(html).toContain("last message");
  });
});
