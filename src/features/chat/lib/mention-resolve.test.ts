import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../../lib/i18n/instance";
import {
  buildVoiceContext,
  buildVoiceMentionMembers,
  mentionDisplayLabel,
  mentionNameAliases,
} from "./mention-resolve";
import { parseVoiceMentions } from "./voice-mention-parser";

const verifiedMember = {
  uid: "u1",
  name: "小明",
  remark: "明哥",
  orgData: { real_name: "张明", realname_verified: 1 },
};

describe("mention real-name resolution", () => {
  beforeEach(() => {
    i18n.setLocale("zh-CN", { notify: false, persist: false });
  });

  it("uses verified real name as the canonical mention label", () => {
    expect(mentionDisplayLabel(verifiedMember)).toBe("张明");
    expect(mentionNameAliases(verifiedMember)).toEqual(["张明", "明哥", "小明"]);
  });

  it("keeps bot mention labels away from real-name augmentation", () => {
    const bot = {
      uid: "bot1",
      name: "Deploy Bot",
      remark: "部署助手",
      orgData: { real_name: "机器人实名", realname_verified: true, robot: 1 },
    };

    expect(mentionDisplayLabel(bot)).toBe("部署助手");
    expect(mentionNameAliases(bot)).toEqual(["部署助手", "Deploy Bot"]);
  });

  it("parses voice mentions by alias but inserts the canonical label", () => {
    const members = buildVoiceMentionMembers([verifiedMember]);

    expect(parseVoiceMentions("@明哥 处理一下", members)).toEqual([
      { type: "mention", attrs: { id: "u1", label: "张明" } },
      { type: "text", text: " " },
      { type: "text", text: "处理一下" },
    ]);
    expect(parseVoiceMentions("@张明 收到", members)[0]).toEqual({
      type: "mention",
      attrs: { id: "u1", label: "张明" },
    });
  });

  it("builds voice member context with distinct verified real names", () => {
    const context = buildVoiceContext({
      members: [
        { ...verifiedMember, uid: "u1" },
        {
          uid: "self",
          name: "我昵称",
          orgData: { real_name: "本人实名", realname_verified: "true" },
        },
      ],
      selfUid: "self",
      selfName: "登录名",
    });

    expect(context.memberContext).toBe("聊天成员：张明，明哥，小明");
    expect(context.selfName).toBe("本人实名，我昵称");
  });
});
