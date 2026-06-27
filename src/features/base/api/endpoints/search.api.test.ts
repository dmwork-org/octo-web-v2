import { describe, expect, it } from "vitest";
import {
  CHANNEL_SEARCH_KEYWORD_MAX_RUNES,
  channelSearchApiTestUtils,
  countChannelSearchKeywordRunes,
  defaultChannelSearchFilters,
  truncateChannelSearchKeyword,
  type ChannelSearchQuery,
} from "./search.api";

const query: ChannelSearchQuery = {
  channelId: "group-a",
  channelType: 2,
  keyword: "进展",
  tab: "message",
  filters: defaultChannelSearchFilters(),
  limit: 20,
};

describe("channel search result mapping", () => {
  it("counts and truncates search keywords by unicode runes", () => {
    const keyword = `${"a".repeat(CHANNEL_SEARCH_KEYWORD_MAX_RUNES - 1)}😀尾`;
    const truncated = truncateChannelSearchKeyword(keyword);

    expect(countChannelSearchKeywordRunes(keyword)).toBe(CHANNEL_SEARCH_KEYWORD_MAX_RUNES + 1);
    expect(countChannelSearchKeywordRunes(truncated)).toBe(CHANNEL_SEARCH_KEYWORD_MAX_RUNES);
    expect(truncated.endsWith("😀")).toBe(true);
  });

  it("maps rich text message hits without losing plain text fallback", () => {
    const item = channelSearchApiTestUtils.mapMessageHit(
      {
        message_id: "m1",
        message_seq: 12,
        message_kind: "text",
        sender_id: "u1",
        sender_name: "Alice",
        sent_at: "2026-06-27T10:00:00Z",
        rich_text: {
          plain: "项目进展 [图片]",
          content: [
            { type: "text", text: "项目进展 " },
            { type: "image", url: "/files/a.png", width: 320, height: 180 },
          ],
        },
      },
      query,
    );

    expect(item.kind).toBe("text");
    expect(item.text).toBe("项目进展 [图片]");
    expect(item.richText?.content).toEqual([
      { type: "text", text: "项目进展 " },
      {
        type: "image",
        url: "/v1/files/a.png",
        width: 320,
        height: 180,
        size: undefined,
        name: undefined,
      },
    ]);
  });

  it("maps message-kind image hits from combined search as media cards", () => {
    const item = channelSearchApiTestUtils.mapMessageHit(
      {
        message_id: "m2",
        message_seq: 13,
        message_kind: "image",
        snippet: "截图",
        sender_id: "u2",
        sent_at: "2026-06-27T10:05:00Z",
        thumb_url: "/thumbs/a.jpg",
        width: 640,
        height: 480,
      },
      query,
    );

    expect(item.kind).toBe("image");
    expect(item.text).toBe("截图");
    expect(item.media?.thumbUrl).toBe("/v1/thumbs/a.jpg");
    expect(item.media?.previewUrl).toBe("/v1/thumbs/a.jpg");
  });

  it("maps forwarded channel search inner messages", () => {
    const item = channelSearchApiTestUtils.mapMessageHit(
      {
        message_id: "m3",
        message_seq: 14,
        message_kind: "forward",
        sender_id: "u3",
        outer_preview: {
          title: "聊天记录",
          child_count: 4,
        },
        inner_messages: [
          {
            message_id: "inner-1",
            type: 1,
            search_text: "内部命中",
            sender_id: "u4",
            sender_name: "Bob",
            sent_at: "2026-06-27T10:10:00Z",
          },
        ],
      },
      query,
    );

    expect(item.kind).toBe("merge_forward");
    expect(item.forward?.childCount).toBe(4);
    expect(item.forward?.innerMessages).toEqual([
      {
        messageId: "inner-1",
        type: 1,
        text: "内部命中",
        senderUid: "u4",
        senderName: "Bob",
        timestamp: 1782555000,
      },
    ]);
  });
});
