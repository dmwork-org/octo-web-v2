import { describe, expect, it } from "vitest";
import { fileRendererRegistry } from "./registry";

describe("file preview renderer registry", () => {
  it("registers common video extensions for media search previews", () => {
    expect(fileRendererRegistry.getRenderer("mp4", "video.mp4").type).toBe("video");
    expect(fileRendererRegistry.getRenderer("", "clip.webm").type).toBe("video");
  });
});
