import { renderToStaticMarkup } from "react-dom/server";
import WKSDK, { Channel, ChannelTypeGroup, ChannelTypePerson, Message } from "wukongimjssdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authStore } from "../../base/stores/auth";
import { i18n } from "../../../lib/i18n/instance";
import { RevokedRenderer } from "./revoked-renderer";

function makeRevokedMessage(channelType: number): Message {
  const message = new Message();
  message.channel = new Channel("target-1", channelType);
  message.fromUID = "bot-1";
  message.remoteExtra.revoke = true;
  message.remoteExtra.revoker = "me";
  return message;
}

describe("RevokedRenderer", () => {
  let previousLocale = i18n.getLocale();

  beforeEach(() => {
    previousLocale = i18n.getLocale();
    i18n.setLocale("zh-CN", { notify: false, persist: false });
    authStore.setState(() => ({
      token: "token",
      user: { uid: "me", name: "我", username: "me" },
    }));
    vi.spyOn(WKSDK.shared().channelManager, "getChannelInfo").mockReturnValue({
      title: "小怪",
    } as never);
  });

  afterEach(() => {
    authStore.setState(() => ({ token: null, user: null }));
    i18n.setLocale(previousLocale, { notify: false, persist: false });
    vi.restoreAllMocks();
  });

  it("uses generic revoke wording when I revoke another user's message in a private chat", () => {
    const html = renderToStaticMarkup(
      <RevokedRenderer message={makeRevokedMessage(ChannelTypePerson)} />,
    );

    expect(html).toContain("你撤回了一条消息");
    expect(html).not.toContain("成员");
  });

  it("keeps member revoke wording when I revoke another user's message in a group", () => {
    const html = renderToStaticMarkup(
      <RevokedRenderer message={makeRevokedMessage(ChannelTypeGroup)} />,
    );

    expect(html).toContain("你撤回了成员");
    expect(html).toContain("小怪");
  });
});
