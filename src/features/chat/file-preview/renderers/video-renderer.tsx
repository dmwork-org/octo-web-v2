import type { BaseRendererProps } from "@/features/chat/file-preview/types";
import { useT } from "@/lib/i18n/use-t";

export function VideoRenderer({ file, onError }: BaseRendererProps) {
  const t = useT();
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
      <video
        key={file.url}
        src={file.url}
        className="max-h-full max-w-full rounded-md"
        controls
        playsInline
        onError={() => onError?.(t("filePreview.video.loadFailed"))}
      />
    </div>
  );
}
