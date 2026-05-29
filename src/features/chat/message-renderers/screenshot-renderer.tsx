import type { Message } from "wukongimjssdk";
import { ScreenshotContent } from "@/features/base/im/screenshot-content";

/**
 * 截屏通知(对应旧 dmworkbase Messages/Screenshot ScreenshotCell):
 * 系统类提示,居中灰字,无气泡。message-row bare 模式渲染。
 */
export function ScreenshotRenderer({ message }: { message: Message }) {
  const content = message.content as ScreenshotContent;
  return (
    <div className="flex justify-center">
      <span className="rounded bg-bg-elevated px-2 py-1 text-[11px] text-text-tertiary">
        {content.tip}
      </span>
    </div>
  );
}
