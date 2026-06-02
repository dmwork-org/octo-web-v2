import { useCallback, useEffect, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { BotCommand } from "@/features/chat/components/slash-command-menu";

export interface SlashCommandState {
  visible: boolean;
  filter: string;
  activeIndex: number;
}

export interface UseSlashCommandReturn {
  state: SlashCommandState;
  /** 给 editorProps.handleKeyDown 调用;true=已消费(阻断后续 keymap)。 */
  handleKeyDown: (event: KeyboardEvent) => boolean;
  handleSelect: (cmd: BotCommand) => void;
  /** 给外部"Enter 提交前再校验一次 menu 是否打开"用 — menu 打开时禁止 submit。 */
  isOpen: () => boolean;
}

/**
 * / 斜杠命令的状态与键盘处理(1:1 对齐旧 dmworkbase MessageInput slashMenu 逻辑)。
 *
 * **触发条件**(对齐旧 `index.tsx:691-705`):
 *   editor.getText() startsWith("/") && 不含空格 && 不含换行 && botCommands 非空
 *
 * **键盘**(menu 打开时,对齐旧 `index.tsx:1117-1166`):
 *   - Escape  → 关 menu(消费)
 *   - ArrowDown / ArrowUp → 切换 activeIndex(消费)
 *   - Enter(无 shift):
 *       - 有匹配 → 选中 + 替换内容为 `/cmd `(消费)
 *       - 无匹配 → 关 menu(消费,**不发送**,与旧版一致)
 *   - 其它键 → 透传(false,不消费,让后续 mention keymap / submitOnEnter 接管)
 *
 * **选中行为**:`editor.setContent("/cmd ")` 整段替换 + focus(对齐旧 `index.tsx:1095-1108`)。
 */
export function useSlashCommand(
  editor: Editor | null,
  botCommands: BotCommand[],
): UseSlashCommandReturn {
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  // 监听 editor 内容变化,自动开/关 menu + 更新 filter
  useEffect(() => {
    if (!editor) return;
    const onUpdate = () => {
      const text = editor.getText();
      const canShow =
        botCommands.length > 0 &&
        text.startsWith("/") &&
        !text.includes(" ") &&
        !text.includes("\n");
      if (canShow) {
        setVisible(true);
        setFilter(text.slice(1));
        setActiveIndex(0);
      } else {
        setVisible(false);
        setFilter("");
        setActiveIndex(0);
      }
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, botCommands]);

  // botCommands 变化(如刚切到 bot)或被清空 → 重置;避免 stale menu
  useEffect(() => {
    if (botCommands.length === 0 && visible) {
      setVisible(false);
      setFilter("");
      setActiveIndex(0);
    }
  }, [botCommands, visible]);

  const filtered = useMemo<BotCommand[]>(() => {
    if (!filter) return botCommands;
    const kw = filter.toLowerCase();
    return botCommands.filter(
      (c) => c.command.toLowerCase().includes(kw) || c.description.toLowerCase().includes(kw),
    );
  }, [filter, botCommands]);

  const handleSelect = useCallback(
    (cmd: BotCommand) => {
      if (!editor) return;
      const text = cmd.command.startsWith("/") ? cmd.command : `/${cmd.command}`;
      // 用 JSON 节点 + chain,确保 doc 结构干净(paragraph + text)、触发 onUpdate
      // 关菜单、且光标落在末尾(便于用户接着输入参数或按 Enter 发送)。
      editor
        .chain()
        .focus()
        .clearContent()
        .insertContent({
          type: "paragraph",
          content: [{ type: "text", text: `${text} ` }],
        })
        .focus("end")
        .run();
      setVisible(false);
      setFilter("");
      setActiveIndex(0);
    },
    [editor],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!visible) return false;
      if (event.key === "Escape") {
        setVisible(false);
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex(
          (prev) => (prev - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length),
        );
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        if (filtered.length > 0) {
          handleSelect(filtered[activeIndex]);
        } else {
          setVisible(false);
        }
        return true;
      }
      return false;
    },
    [visible, filtered, activeIndex, handleSelect],
  );

  const isOpen = useCallback(() => visible, [visible]);

  return {
    state: { visible, filter, activeIndex },
    handleKeyDown,
    handleSelect,
    isOpen,
  };
}
