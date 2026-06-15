import { describe, expect, it, vi } from "vitest";
import { detectPastedSecret, handleSecretPaste } from "./secret-paste-detect";

describe("secret paste detection", () => {
  it("detects supported secret prefixes", () => {
    expect(detectPastedSecret("sk-abcdefghijklmnop")?.prefix).toBe("sk-");
    expect(detectPastedSecret("bf-1234567890abcdef")?.prefix).toBe("bf-");
    expect(detectPastedSecret("app-1234567890abcdef")?.prefix).toBe("app-");
  });

  it("detects secrets inside env and JSON shaped text", () => {
    expect(detectPastedSecret("OPENAI_API_KEY=sk-ABCDEFGHIJKLMNOP")?.value).toBe(
      "sk-ABCDEFGHIJKLMNOP",
    );
    expect(detectPastedSecret('{"api_key":"sk-ABCDEFGHIJKLMNOP"}')?.value).toBe(
      "sk-ABCDEFGHIJKLMNOP",
    );
  });

  it("ignores short tokens and identifier-embedded prefixes", () => {
    expect(detectPastedSecret("app-store")).toBeNull();
    expect(detectPastedSecret("sk-short")).toBeNull();
    expect(detectPastedSecret("myapp-tokenABCDEFGHIJKL")).toBeNull();
  });

  it("hard-blocks matching paste text", () => {
    const onDetected = vi.fn();
    expect(handleSecretPaste("sk-ABCDEFGHIJKLMNOP", onDetected)).toBe(true);
    expect(onDetected).toHaveBeenCalledWith("sk-ABCDEFGHIJKLMNOP");
  });

  it("allows normal paste text", () => {
    const onDetected = vi.fn();
    expect(handleSecretPaste("normal chat text", onDetected)).toBe(false);
    expect(onDetected).not.toHaveBeenCalled();
  });
});
