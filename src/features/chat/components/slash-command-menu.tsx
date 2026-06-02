import { useEffect, useMemo, useRef } from "react";

export interface BotCommand {
  command: string;
  description: string;
}

interface SlashCommandMenuProps {
  commands: BotCommand[];
  filter: string;
  visible: boolean;
  activeIndex: number;
  onSelect: (command: BotCommand) => void;
}

/**
 * activeIndex 变化时把对应行滚到视口内(无 ref 时无操作)。
 * 抽成命名 hook 满足 no-useeffect-in-component。
 */
function useScrollActiveIntoView(activeRef: React.RefObject<HTMLElement | null>, key: unknown) {
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * / 斜杠命令菜单(1:1 对齐旧 dmworkbase SlashCommandMenu):
 *
 * - 触发条件由 composer 端控制(text 以 "/" 开头 + 无空格/换行)
 * - 弹出位置:相对 composer form **absolute bottom-full** + 跟 form 等宽
 * - 行布局:14px 加粗命令名 + 12px 描述,active 项灰底 + scrollIntoView
 * - filter 过滤:命令名 / 描述任一 includes(filter) 即匹配
 * - onMouseDown preventDefault → 不让 editor 失焦,直接 onSelect
 *
 * 旧 CSS:wk-slash-command-menu / wk-slash-command-item / -active / -name / -desc
 */
export function SlashCommandMenu({
  commands,
  filter,
  visible,
  activeIndex,
  onSelect,
}: SlashCommandMenuProps) {
  const filtered = useMemo<BotCommand[]>(() => {
    if (!filter) return commands;
    const kw = filter.toLowerCase();
    return commands.filter(
      (c) => c.command.toLowerCase().includes(kw) || c.description.toLowerCase().includes(kw),
    );
  }, [commands, filter]);

  const activeRef = useRef<HTMLButtonElement>(null);
  useScrollActiveIntoView(activeRef, activeIndex);

  if (!visible) return null;

  return (
    <div className="absolute bottom-full left-0 z-10 mb-1 max-h-[300px] w-full overflow-y-auto rounded-md border border-border-default bg-bg-surface py-1 shadow-lg">
      <div className="border-b border-border-subtle px-3 py-1.5 text-xs text-text-tertiary">
        机器人命令
      </div>
      {filtered.length === 0 ? (
        <div className="px-3 py-3 text-center text-[13px] text-text-tertiary">无匹配的命令</div>
      ) : (
        filtered.map((cmd, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={cmd.command}
              ref={isActive ? activeRef : undefined}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(cmd);
              }}
              className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors ${
                isActive ? "bg-bg-hover" : "hover:bg-bg-hover"
              }`}
            >
              <div className="text-sm font-semibold text-text-primary">
                {cmd.command.startsWith("/") ? cmd.command : `/${cmd.command}`}
              </div>
              <div className="text-xs text-text-tertiary">{cmd.description}</div>
            </button>
          );
        })
      )}
    </div>
  );
}
