import { describe, expect, it } from "vitest";
import { shouldRetryMatterDetailQuery } from "./matters.query";

describe("shouldRetryMatterDetailQuery", () => {
  it("does not retry client errors", () => {
    expect(shouldRetryMatterDetailQuery(0, { response: { status: 400 } })).toBe(false);
    expect(shouldRetryMatterDetailQuery(0, { status: 404 })).toBe(false);
    expect(shouldRetryMatterDetailQuery(0, { statusCode: 403 })).toBe(false);
  });

  it("keeps retrying server and network errors up to the default limit", () => {
    expect(shouldRetryMatterDetailQuery(0, { response: { status: 500 } })).toBe(true);
    expect(shouldRetryMatterDetailQuery(2, new Error("network"))).toBe(true);
    expect(shouldRetryMatterDetailQuery(3, { response: { status: 500 } })).toBe(false);
  });
});
