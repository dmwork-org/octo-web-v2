import { describe, expect, it } from "vitest";
import {
  buildWebhookAdapterExamples,
  buildWebhookUpsertReq,
  buildWebhookUrlRows,
  isFlagOn,
  normalizeMentionUids,
  toShortWebhookAlias,
  validateMentionUids,
  MENTION_UID_MAX_LENGTH,
  MENTION_UIDS_MAX,
  type IncomingWebhookCreateResp,
} from "./incoming-webhook";

describe("incoming webhook mention config", () => {
  it("normalizes and validates mention uids", () => {
    expect(normalizeMentionUids([" u1 ", "", "u1", "u2"])).toEqual(["u1", "u2"]);
    expect(
      validateMentionUids(Array.from({ length: MENTION_UIDS_MAX + 1 }, (_, i) => `u${i}`)),
    ).toEqual({
      ok: false,
      reason: "tooMany",
    });
    expect(validateMentionUids(["x".repeat(MENTION_UID_MAX_LENGTH + 1)])).toEqual({
      ok: false,
      reason: "tooLong",
    });
  });

  it("builds create and update request bodies for mention permissions", () => {
    expect(isFlagOn("true")).toBe(true);
    expect(
      buildWebhookUpsertReq({
        isEdit: false,
        isManager: false,
        name: " alerts ",
        avatar: "https://avatar.example/a.png",
        mentionAll: true,
        mentionBots: false,
        mentionUids: ["u1", "u1", " u2 "],
      }),
    ).toEqual({
      name: "alerts",
      allow_mention_all: true,
      mention_uids: ["u1", "u2"],
    });

    expect(
      buildWebhookUpsertReq({
        isEdit: true,
        isManager: true,
        name: "alerts",
        avatar: "",
        mentionAll: false,
        mentionBots: true,
        mentionUids: [],
        webhook: {
          name: "alerts",
          avatar: "",
          allow_mention_all: 1,
          allow_mention_bots: 0,
          mention_uids: ["u1"],
        },
      }),
    ).toEqual({
      allow_mention_all: false,
      allow_mention_bots: true,
      mention_uids: [],
    });
  });
});

describe("incoming webhook url helpers", () => {
  const resp: Pick<IncomingWebhookCreateResp, "url" | "urls"> = {
    url: "/v1/incoming-webhooks/iwh_1/t1",
    urls: {
      github: "/v1/incoming-webhooks/iwh_1/t1/github",
      gitlab: "/v1/incoming-webhooks/iwh_1/t1/gitlab",
      feishu: "/v1/incoming-webhooks/iwh_1/t1/feishu",
      multica: "/v1/incoming-webhooks/iwh_1/t1/multica",
      wecom: "/v1/incoming-webhooks/iwh_1/t1/wecom",
    },
  };

  it("rewrites canonical public paths to the short webhook alias", () => {
    expect(toShortWebhookAlias("/v1/incoming-webhooks/iwh_1/t1/github")).toBe(
      "/v1/webhooks/iwh_1/t1/github",
    );
    expect(toShortWebhookAlias("/v1/webhooks/iwh_1/t1")).toBe("/v1/webhooks/iwh_1/t1");
  });

  it("builds all supported adapter url rows", () => {
    expect(
      buildWebhookUrlRows(resp, "/api/v1", "https://octo.example").map((row) => row.key),
    ).toEqual(["native", "github", "gitlab", "wecom", "feishu", "multica"]);
    expect(buildWebhookUrlRows(resp, "/api/v1", "https://octo.example")[0]?.url).toBe(
      "https://octo.example/api/v1/webhooks/iwh_1/t1",
    );
  });

  it("uses server-driven adapter examples when present", () => {
    const rows = buildWebhookAdapterExamples(
      {
        adapter_examples: [
          {
            key: "gitlab",
            title: " GitLab ",
            description: " Project hooks ",
            url: "/v1/incoming-webhooks/iwh_1/t1/gitlab",
            content_type: "application/json",
            auth: { type: "url_token_and_header", header: "X-Gitlab-Token", value_source: "token" },
            steps: [" one ", "", "two"],
          },
        ],
      },
      "/api/v1",
      "https://octo.example",
    );
    expect(rows).toEqual([
      {
        key: "gitlab",
        title: "GitLab",
        description: "Project hooks",
        url: "https://octo.example/api/v1/webhooks/iwh_1/t1/gitlab",
        contentType: "application/json",
        auth: { type: "url_token_and_header", header: "X-Gitlab-Token", value_source: "token" },
        steps: ["one", "two"],
      },
    ]);
  });
});
