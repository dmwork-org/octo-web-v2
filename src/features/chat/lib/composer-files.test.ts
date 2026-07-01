import { describe, expect, it } from "vitest";
import { splitClipboardFiles } from "./composer-files";

function item(file: File, type = file.type): DataTransferItem {
  return {
    kind: "file",
    type,
    getAsFile: () => file,
  } as DataTransferItem;
}

function items(list: DataTransferItem[]): DataTransferItemList {
  return Object.assign({ length: list.length }, list) as unknown as DataTransferItemList;
}

describe("splitClipboardFiles", () => {
  it("keeps pasted image files inline and routes other files to upload", () => {
    const image = new File(["img"], "copied.png", { type: "image/png" });
    const pdf = new File(["pdf"], "doc.pdf", { type: "application/pdf" });

    expect(splitClipboardFiles(items([item(image), item(pdf)]))).toEqual({
      images: [image],
      others: [pdf],
    });
  });

  it("uses the file mime when the clipboard item type is empty", () => {
    const image = new File(["img"], "copied.png", { type: "image/png" });

    expect(splitClipboardFiles(items([item(image, "")]))).toEqual({
      images: [image],
      others: [],
    });
  });
});
