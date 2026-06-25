import { Subscriber } from "wukongimjssdk";
import { describe, expect, it } from "vitest";
import { isVerifiedMember } from "../lib/member-realname";

function member(orgData: Subscriber["orgData"]): Subscriber {
  const subscriber = new Subscriber();
  subscriber.orgData = orgData;
  return subscriber;
}

describe("isVerifiedMember", () => {
  it("detects realname verified group members", () => {
    expect(isVerifiedMember(member({ real_name: "张三", realname_verified: 1 }))).toBe(true);
    expect(isVerifiedMember(member({ real_name: "张三", realname_verified: "true" }))).toBe(true);
  });

  it("does not mark bots or unverified members", () => {
    expect(isVerifiedMember(member({ real_name: "机器人", realname_verified: 1, robot: 1 }))).toBe(
      false,
    );
    expect(isVerifiedMember(member({ real_name: "李四", realname_verified: 0 }))).toBe(false);
  });
});
