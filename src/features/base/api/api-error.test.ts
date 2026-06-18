import { describe, expect, it } from "vitest";
import { extractApiErrorMessage, extractResponseErrorMessage } from "./api-error";

describe("api error message extraction", () => {
  it("prefers backend friendly message over raw fetch error", () => {
    const message = extractApiErrorMessage(
      {
        data: { msg: "消息已超过可撤回时限" },
        message: '[POST] "/api/message/revoke?message_id=1": 400 Bad Request',
      },
      "撤回失败",
    );

    expect(message).toBe("消息已超过可撤回时限");
  });

  it("falls back when only raw fetch error is available", () => {
    const message = extractApiErrorMessage(
      {
        message: '[POST] "/api/message/revoke?message_id=1": 400 Bad Request',
      },
      "撤回失败",
    );

    expect(message).toBe("撤回失败");
  });

  it("extracts friendly response message for global toast", () => {
    const message = extractResponseErrorMessage({
      _data: { message: "请求参数不正确" },
      status: 400,
      statusText: "Bad Request",
    });

    expect(message).toBe("请求参数不正确");
  });
});
