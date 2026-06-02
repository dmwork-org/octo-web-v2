/**
 * Chat 右侧 panel 互斥 store — 替代旧 dmworkbase Pages/Chat 里
 * `showThreadPanel / previewFile / showMatterPanel` 多 boolean 互斥模式。
 *
 * **不变量**:同一时刻最多渲染 1 个右侧 panel。
 *   - `open*` action 自动覆盖前一个 state(对齐旧 _onFilePreview 里强制
 *     `showThreadPanel: false / showMatterPanel: false` 等的互斥规则)
 *   - file-renderer 点卡片 → openFilePreview → 自动关 thread/matter
 *   - chat-header 点 thread → toggleThreads → 自动关 filePreview/matter
 *   - chat-header 点 matter → toggleMatter → 自动关 thread/filePreview
 *
 * **新仓布局**:panel 是 chat-main 横向 flex sibling(380px shrink-0),不是
 * 旧仓 absolute drawer + margin-right transition。3 个 panel 同形态,
 * `chatSidePanelStore.kind` 决定渲染哪个。
 *
 * **matter 双栈**:kind="matter" 内部用 matterId(null=列表 / 非空=详情),
 * 避免在 store 上再建一层 kind=matterDetail(导航语义在 panel 内更清晰)。
 */

import { Store } from "@tanstack/react-store";
import type { FilePreviewInfo } from "@/features/chat/file-preview/types";

export type SidePanelState =
  | { kind: "none" }
  | { kind: "threads" }
  | { kind: "filePreview"; file: FilePreviewInfo }
  | { kind: "matter"; matterId: string | null };

export const chatSidePanelStore = new Store<SidePanelState>({ kind: "none" });

export const chatSidePanelActions = {
  openThreads: () => chatSidePanelStore.setState(() => ({ kind: "threads" })),
  openFilePreview: (file: FilePreviewInfo) =>
    chatSidePanelStore.setState(() => ({ kind: "filePreview", file })),
  /** 打开 matter 面板:可选 matterId 直接定位详情;否则进列表。 */
  openMatter: (matterId: string | null = null) =>
    chatSidePanelStore.setState(() => ({ kind: "matter", matterId })),
  close: () => chatSidePanelStore.setState(() => ({ kind: "none" })),
  /** thread 按钮 toggle:当前是 threads 关掉,否则打开 threads。 */
  toggleThreads: () =>
    chatSidePanelStore.setState((s) =>
      s.kind === "threads" ? { kind: "none" } : { kind: "threads" },
    ),
  /** matter 按钮 toggle:当前是 matter 关掉,否则打开 matter 列表。 */
  toggleMatter: () =>
    chatSidePanelStore.setState((s) =>
      s.kind === "matter" ? { kind: "none" } : { kind: "matter", matterId: null },
    ),
  /** matter 面板内列表/详情切换;仅当 kind=matter 时生效。 */
  selectMatter: (matterId: string | null) =>
    chatSidePanelStore.setState((s) => (s.kind === "matter" ? { kind: "matter", matterId } : s)),
};
