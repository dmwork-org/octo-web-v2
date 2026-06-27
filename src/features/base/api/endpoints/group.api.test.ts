import { describe, expect, it } from "vitest";
import { incomingWebhookBasePath, normalizeIncomingWebhookList } from "./group.api";

describe("group incoming webhook endpoints", () => {
  it("builds group and thread-scoped webhook paths", () => {
    expect(incomingWebhookBasePath("g 1")).toBe("groups/g%201/incoming-webhooks");
    expect(incomingWebhookBasePath("g 1", "t/2")).toBe(
      "groups/g%201/threads/t%2F2/incoming-webhooks",
    );
  });

  it("normalizes list response shapes", () => {
    const webhook = {
      webhook_id: "w1",
      group_no: "g1",
      name: "build",
      avatar: "",
      creator_uid: "u1",
      status: 1,
      last_used_at: 0,
      call_count: 0,
      created_at: 1,
    };
    expect(normalizeIncomingWebhookList([webhook])).toEqual([webhook]);
    expect(normalizeIncomingWebhookList({ list: [webhook] })).toEqual([webhook]);
    expect(normalizeIncomingWebhookList(null)).toEqual([]);
  });
});
