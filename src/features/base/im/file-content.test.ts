import { describe, expect, it } from "vitest";
import { FileContent } from "./file-content";

describe("FileContent", () => {
  it("keeps SDK extension and UI ext fields in sync", () => {
    const content = new FileContent(undefined, "clip.mov", "mov", 1024);

    expect(content.ext).toBe("mov");
    expect(content.extension).toBe("mov");
    expect(content.encodeJSON()).toMatchObject({ extension: "mov" });
  });

  it("hydrates both extension aliases from server payload", () => {
    const content = new FileContent();

    content.decodeJSON({ name: "clip.mov", extension: "mov", size: 1024, url: "https://file" });

    expect(content.ext).toBe("mov");
    expect(content.extension).toBe("mov");
    expect(content.remoteUrl).toBe("https://file");
  });
});
