/**
 * Chat 右侧 panel 互斥 store — 替代旧 dmworkbase Pages/Chat 里
 * `showThreadPanel / previewFile / showMatterPanel` 多 boolean 互斥模式。
 *
 * **不变量**:同一时刻最多渲染 1 个右侧 panel。
 *   - `open*` action 自动覆盖前一个 state(对齐旧 _onFilePreview 里强制
 *     `showThreadPanel: false / showMatterPanel: false` 等的互斥规则)
 *   - file-renderer 点卡片 → openFilePreview → 自动关 thread
 *   - chat-header 点 thread → openThreads → 自动关 filePreview
 *
 * **新仓布局**:panel 是 chat-main 横向 flex sibling(380px shrink-0),不是
 * 旧仓 absolute drawer + margin-right transition。两个 panel 同形态,
 * `chatSidePanelStore.kind` 决定渲染哪个。
 */

import { Store } from "@tanstack/react-store";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";

export type SidePanelState =
  | { kind: "none" }
  | { kind: "threads" }
  | { kind: "filePreview"; file: FilePreviewInfo };

export const chatSidePanelStore = new Store<SidePanelState>({ kind: "none" });

export const chatSidePanelActions = {
  openThreads: () => chatSidePanelStore.setState(() => ({ kind: "threads" })),
  openFilePreview: (file: FilePreviewInfo) =>
    chatSidePanelStore.setState(() => ({ kind: "filePreview", file })),
  close: () => chatSidePanelStore.setState(() => ({ kind: "none" })),
  /** thread 按钮 toggle:当前是 threads 关掉,否则打开 threads。 */
  toggleThreads: () =>
    chatSidePanelStore.setState((s) =>
      s.kind === "threads" ? { kind: "none" } : { kind: "threads" },
    ),
};
