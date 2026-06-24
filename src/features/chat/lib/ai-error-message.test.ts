import { describe, expect, it } from "vitest";
import { isRawAiServiceError, safeAiServiceText } from "./ai-error-message";

describe("ai error message", () => {
  it("hides raw LLM errors from users", () => {
    const raw = "LLM error new_api_error: token quota is not enough, token remain quota: $0.04";

    expect(isRawAiServiceError(raw)).toBe(true);
    expect(safeAiServiceText(raw, "AI 服务暂时不可用")).toBe("AI 服务暂时不可用");
  });

  it("leaves normal text unchanged", () => {
    expect(safeAiServiceText("LLM error 不是这里的前缀", "AI 服务暂时不可用")).toBe(
      "AI 服务暂时不可用",
    );
    expect(safeAiServiceText("排查 LLM error 时的说明", "AI 服务暂时不可用")).toBe(
      "排查 LLM error 时的说明",
    );
  });
});
