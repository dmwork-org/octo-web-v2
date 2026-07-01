import { useEffect, useState } from "react";
import WKSDK, { MessageStatus, type Message, type MessageImage } from "wukongimjssdk";
import { Loader2, RotateCw } from "lucide-react";
import { ImagePreviewModal } from "@/features/chat/components/image-preview-modal";
import { message as toast } from "@/components/ui/message";
import { isConversationDisbanded } from "@/features/chat/lib/group-disband";
import { useT } from "@/lib/i18n/use-t";

interface ImageRendererProps {
  message: Message;
}

// 对齐旧 SingleImage(packages/dmworkbase/src/ui/message/ImageContent/SingleImage.tsx)
const MAX_W = 660; // 旧 FALLBACK_MAX_WIDTH
const MAX_H = 372; // 旧 MAX_HEIGHT

/**
 * 订阅 message.status 变化(简化版,500ms 轮询直到 status 离开 Wait 终态)。
 *
 * 严格应该走 WKSDK messageManager listener,但本期简化:发送中(Wait)态时
 * 每 500ms force-update;status 进 Normal/Fail 终态后停止。SDK 改了 message
 * 实例的 status 字段,React 不感知,需要这种 tick 触发重渲。
 */
function useMessageStatusTick(message: Message): void {
  const [, force] = useState(0);
  useEffect(() => {
    if (message.status !== MessageStatus.Wait) return;
    const id = setInterval(() => {
      force((v) => v + 1);
      if (message.status !== MessageStatus.Wait) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [message]);
}

/**
 * 图片加载失败标志:`<img onError>` 时置 true。`src` 变化(上传成功 / 重发拿到新
 * 地址)时自动复位,重新尝试加载。抽成命名 hook 以满足 no-useeffect-in-component。
 */
function useImageError(src: string): {
  imgError: boolean;
  markError: () => void;
  retry: () => void;
} {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [src]);
  return {
    imgError,
    markError: () => setImgError(true),
    retry: () => setImgError(false),
  };
}

/**
 * 图片消息(Slack 风格 — 直接缩略图,无气泡)。
 *
 * 视觉对齐旧 SingleImage + ImageContent/index.css。
 *
 * **发送状态 overlay**(对齐上游 817f87a6 / #156):
 * - message.status === Wait → 半透明遮罩 + 加载 spinner("发送中")
 * - message.status === Fail → 半透明遮罩 + 红色 ! + "发送失败"提示
 *   (点击 overlay 触发 resend,跟 MessageStatusBadge 同款行为)
 * - 已发送(Normal)→ 无 overlay
 *
 * 点击缩略图(非 sending/failed 态)全屏预览(P5 接 lightbox 完整工具栏)。
 */
export function ImageRenderer({ message }: ImageRendererProps) {
  const t = useT();
  const image = message.content as MessageImage;
  const [preview, setPreview] = useState(false);
  useMessageStatusTick(message);

  const src = image.url || "";
  const { imgError, markError, retry } = useImageError(src);

  const naturalW = image.width || 200;
  const naturalH = image.height || 200;
  const ratio = Math.min(MAX_W / naturalW, MAX_H / naturalH, 1);
  const w = Math.round(naturalW * ratio);
  const h = Math.round(naturalH * ratio);

  const sending = message.status === MessageStatus.Wait;
  // 发送失败:上传 task 失败时 upload-task.markFail() 会把 message.status 翻 Fail(GH#135)。
  // 这是"我发出去没成功"的态,给「重发」入口(resend 整条 content)。
  const sendFailed = message.status === MessageStatus.Fail;
  // 注:既不在发送中、也不是发送失败,但图片加载不出来(代理/CDN 不可达,<img onError>)
  // 或压根没有 url(脏消息 / 服务端落了空 url)的"加载失败"态,由 renderThumb 内部分支
  // 处理(降级为静态提示 / 仅重试加载),**不 resend**(可能是别人发的图,误重发是 bug)。
  const canPreview = !!src && !imgError && !sending && !sendFailed;

  const renderThumb = () => {
    if (src && !imgError) {
      return (
        <img
          src={src}
          alt=""
          width={w}
          height={h}
          className="block"
          style={{ maxWidth: MAX_W, maxHeight: MAX_H, objectFit: "contain" }}
          onError={() => markError()}
        />
      );
    }
    if (sending) {
      return (
        <div className="flex h-32 w-32 items-center justify-center text-xs text-text-tertiary">
          {t("imageRenderer.imageLoading")}
        </div>
      );
    }
    if (imgError) {
      // url 有值但加载失败 → 仅"重新加载"(复位 imgError 触发 <img> 重新请求),不 resend。
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            retry();
          }}
          className="flex h-32 w-32 flex-col items-center justify-center gap-1 text-xs text-text-tertiary hover:text-text-secondary"
        >
          <RotateCw size={16} />
          <span>{t("imageRenderer.imageLoadFailed")}</span>
        </button>
      );
    }
    // 无 url 且非发送中:没有图片地址,无法加载(发送失败时由下方 overlay 覆盖)。
    return (
      <div className="flex h-32 w-32 items-center justify-center text-xs text-text-tertiary">
        {t("imageRenderer.imageUnavailable")}
      </div>
    );
  };

  const thumb = renderThumb();

  return (
    <>
      <div className="relative w-fit">
        {canPreview ? (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="block w-fit overflow-hidden rounded-lg bg-bg-elevated transition-opacity hover:opacity-90"
            aria-label={t("imageRenderer.viewLargeImage")}
          >
            {thumb}
          </button>
        ) : (
          <div className="block w-fit overflow-hidden rounded-lg bg-bg-elevated">{thumb}</div>
        )}

        {sending ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/40 text-white">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-[11px]">{t("imageRenderer.sending")}</span>
          </div>
        ) : null}

        {sendFailed ? (
          <button
            type="button"
            aria-label={t("messageStatus.resend")}
            onClick={() => {
              if (isConversationDisbanded(message.channel)) {
                toast.warning(t("composer.disbandedNotice"));
                return;
              }
              void WKSDK.shared().chatManager.send(message.content, message.channel);
            }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-black/40 text-white hover:bg-black/50"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-error text-white">
              <RotateCw size={14} />
            </div>
            <span className="text-[11px]">{t("imageRenderer.failed")}</span>
          </button>
        ) : null}
      </div>

      {preview && src ? <ImagePreviewModal src={src} onClose={() => setPreview(false)} /> : null}
    </>
  );
}
