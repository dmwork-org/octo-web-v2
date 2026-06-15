import { renderToStaticMarkup } from "react-dom/server";
import WKSDK, { Channel, ChannelTypeGroup, Mention } from "wukongimjssdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MentionAwareText } from "./mention-aware-text";

function renderText(text: string, mention?: Mention, channel?: Channel): string {
  return renderToStaticMarkup(
    <MentionAwareText text={text} mention={mention} channel={channel} linkify />,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MentionAwareText linkify", () => {
  it("renders @所有人 as a mention highlight DOM node", () => {
    const mention = new Mention();
    (mention as Mention & { humans?: number }).humans = 1;
    const html = renderText("请 @所有人 看一下", mention);

    expect(html).toContain("<span");
    expect(html).toContain(">@所有人</span>");
    expect(html).toContain("bg-[rgba(107,61,216,0.08)]");
  });

  it("renders broadcast and ordinary mentions with the same highlight style", () => {
    const mention = new Mention();
    (mention as Mention & { humans?: number }).humans = 1;
    mention.uids = ["u1"];
    const html = renderText("请 @所有人 和 @张三 看一下", mention);

    expect(html).toContain(">@所有人</span>");
    expect(html).toContain(">@张三</button>");
    expect(html.match(/bg-\[rgba\(107,61,216,0\.08\)\]/g)).toHaveLength(2);
  });

  it("renders safe rich-text links with highlight styling", () => {
    const html = renderText("文档 https://example.com/a?b=1。");

    expect(html).toContain('href="https://example.com/a?b=1"');
    expect(html).toContain("text-text-accent underline underline-offset-2");
    expect(html).toContain(">https://example.com/a?b=1</a>。");
  });

  it("normalizes www links to https hrefs", () => {
    const html = renderText("入口 www.example.com/path");

    expect(html).toContain('href="https://www.example.com/path"');
    expect(html).toContain(">www.example.com/path</a>");
  });

  it("does not consume mention uids for at-signs inside links", () => {
    const mention = new Mention();
    mention.uids = ["u1"];
    const html = renderText("https://example.com/@docs @张三", mention);

    expect(html).toContain(">https://example.com/@docs</a>");
    expect(html).toContain("<button");
    expect(html).toContain(">@张三</button>");
  });
});

describe("MentionAwareText mentions", () => {
  it("keeps special-character display names fully highlighted before shorter aliases", () => {
    const channel = new Channel("group-1", ChannelTypeGroup);
    const mention = new Mention();
    mention.uids = ["user-1"];
    vi.spyOn(WKSDK.shared().channelManager, "getSubscribes").mockReturnValue([
      {
        uid: "user-1",
        remark: "郭斌丨Octo",
        name: "郭斌",
      },
    ] as never);

    const html = renderText("@郭斌丨Octo", mention, channel);

    expect(html).toContain(">@郭斌丨Octo</button>");
    expect(html).not.toContain(">@郭斌</button>丨Octo");
  });
});
