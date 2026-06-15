import { describe, expect, it } from "vitest";
import {
  maskSecretFromLast4,
  normalizeSecretName,
  normalizeSecretsList,
  type SecretListItem,
} from "./secrets.api";

const raw = {
  secret_id: "sec_1",
  display_name: "Company OpenAI",
  kind: "llm",
  last4: "a1b2",
  created_at: "2026-06-15T00:00:00Z",
  updated_at: "2026-06-15T01:00:00Z",
  last_used_at: null,
  key: "sk-should-not-survive",
  plaintext: "sk-should-not-survive",
  ciphertext: "cipher",
  value: "sk-should-not-survive",
} as unknown as SecretListItem;

describe("secrets api normalizers", () => {
  it("normalizes supported list response shapes", () => {
    expect(normalizeSecretsList({ secrets: [raw] })).toHaveLength(1);
    expect(normalizeSecretsList({ list: [raw] })).toHaveLength(1);
    expect(normalizeSecretsList({ items: [raw] })).toHaveLength(1);
    expect(normalizeSecretsList([raw])).toHaveLength(1);
    expect(normalizeSecretsList({ data: { secrets: [raw] } })).toHaveLength(1);
  });

  it("whitelists list item fields and drops secret-bearing fields", () => {
    const [item] = normalizeSecretsList({ secrets: [raw] });
    expect(item).toEqual({
      secret_id: "sec_1",
      display_name: "Company OpenAI",
      kind: "llm",
      masked: "••••a1b2",
      last4: "a1b2",
      created_at: "2026-06-15T00:00:00Z",
      updated_at: "2026-06-15T01:00:00Z",
      last_used_at: null,
    });
    expect(JSON.stringify(item)).not.toContain("should-not-survive");
  });

  it("normalizes names and masks last4", () => {
    expect(normalizeSecretName("  My   Key  ")).toBe("my key");
    expect(maskSecretFromLast4("zz99")).toBe("••••zz99");
    expect(maskSecretFromLast4()).toBe("••••••••");
  });
});
