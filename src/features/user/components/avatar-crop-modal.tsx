import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent,
  type SetStateAction,
  type WheelEvent,
} from "react";
import { ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";

interface AvatarCropModalProps {
  open: boolean;
  file: File | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

const DEFAULT_PREVIEW_SIZE = 320;
const CROP_RATIO = 0.78;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.2;
const JPEG_QUALITY = 0.92;

function useObjectUrl(file: File | null): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function useResetEditorState(
  imageUrl: string,
  setOffset: (v: Point) => void,
  setZoom: (v: number) => void,
  setError: (v: string | null) => void,
) {
  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setZoom(MIN_ZOOM);
    setError(null);
  }, [imageUrl, setError, setOffset, setZoom]);
}

function clampOffset(offset: Point, imageSize: Size, cropSize: number, zoom: number): Point {
  if (imageSize.width <= 0 || imageSize.height <= 0 || cropSize <= 0) {
    return { x: 0, y: 0 };
  }
  const baseScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
  const scaledWidth = imageSize.width * baseScale * zoom;
  const scaledHeight = imageSize.height * baseScale * zoom;
  const maxX = Math.max(0, (scaledWidth - cropSize) / 2);
  const maxY = Math.max(0, (scaledHeight - cropSize) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function useClampOffsetOnGeometryChange(
  imageSize: Size,
  cropSize: number,
  zoom: number,
  setOffset: Dispatch<SetStateAction<Point>>,
) {
  useEffect(() => {
    setOffset((current) => clampOffset(current, imageSize, cropSize, zoom));
  }, [cropSize, imageSize, setOffset, zoom]);
}

function cropFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "avatar"}-crop.jpg`;
}

function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas toBlob failed"));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

async function cropAvatarImage(args: {
  file: File;
  image: HTMLImageElement;
  imageSize: Size;
  cropSize: number;
  offset: Point;
  zoom: number;
}): Promise<File> {
  const { file, image, imageSize, cropSize, offset, zoom } = args;
  const baseScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
  const scale = baseScale * zoom;
  const renderedWidth = imageSize.width * scale;
  const renderedHeight = imageSize.height * scale;
  const sourceX = ((renderedWidth - cropSize) / 2 - offset.x) / scale;
  const sourceY = ((renderedHeight - cropSize) / 2 - offset.y) / scale;
  const sourceSize = cropSize / scale;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  const blob = await blobFromCanvas(canvas);
  return new File([blob], cropFileName(file.name), { type: "image/jpeg" });
}

export function AvatarCropModal({
  open,
  file,
  loading = false,
  onCancel,
  onConfirm,
}: AvatarCropModalProps) {
  const t = useT();
  const imageUrl = useObjectUrl(file);
  const [previewRef, previewSize] = useElementSize<HTMLDivElement>();
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<Point | null>(null);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewSide =
    Math.min(previewSize.width, previewSize.height) > 0
      ? Math.min(previewSize.width, previewSize.height)
      : DEFAULT_PREVIEW_SIZE;
  const cropSize = Math.round(previewSide * CROP_RATIO);
  const imageReady = imageSize.width > 0 && imageSize.height > 0 && cropSize > 0;
  const baseScale = imageReady
    ? Math.max(cropSize / imageSize.width, cropSize / imageSize.height)
    : 1;
  const canZoomOut = imageReady && zoom > MIN_ZOOM;
  const canZoomIn = imageReady && zoom < MAX_ZOOM;

  useResetEditorState(imageUrl, setOffset, setZoom, setError);
  useClampOffsetOnGeometryChange(imageSize, cropSize, zoom, setOffset);

  const updateZoom = (nextZoom: number) => {
    const clampedZoom = clampZoom(nextZoom);
    setZoom(clampedZoom);
    setOffset((current) => clampOffset(current, imageSize, cropSize, clampedZoom));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!imageReady || loading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = dragRef.current;
    if (!last || !imageReady) return;
    const nextPoint = { x: event.clientX, y: event.clientY };
    const dx = nextPoint.x - last.x;
    const dy = nextPoint.y - last.y;
    dragRef.current = nextPoint;
    setOffset((current) =>
      clampOffset({ x: current.x + dx, y: current.y + dy }, imageSize, cropSize, zoom),
    );
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!imageReady || loading) return;
    event.preventDefault();
    updateZoom(zoom - event.deltaY * 0.002);
  };

  const onDone = async () => {
    if (!file || !imageRef.current || !imageReady || loading) return;
    try {
      const cropped = await cropAvatarImage({
        file,
        image: imageRef.current,
        imageSize,
        cropSize,
        offset,
        zoom,
      });
      onConfirm(cropped);
    } catch {
      setError(t("user.avatar.cropFailed"));
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      size="fit"
      hideHeader
      description={t("user.avatar.editTitle")}
      className="w-[360px] max-w-[calc(100vw-24px)]"
      contentClassName="overflow-hidden"
      closeOnMask={!loading}
      closeOnEsc={!loading}
    >
      <div className="flex flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border-subtle px-5">
          <button
            type="button"
            aria-label={t("base.common.back")}
            onClick={onCancel}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <ArrowLeft size={30} />
          </button>
          <Button loading={loading} onClick={() => void onDone()} disabled={!imageReady}>
            {t("user.avatar.done")}
          </Button>
        </header>

        <div className="flex flex-col items-center bg-bg-base px-5 py-5">
          <div
            ref={previewRef}
            role="application"
            aria-label={t("user.avatar.editTitle")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
            onWheel={onWheel}
            className={`relative aspect-square w-full max-w-[320px] touch-none overflow-hidden bg-bg-elevated ${
              dragging ? "cursor-grabbing" : "cursor-grab"
            }`}
          >
            {imageUrl ? (
              <img
                ref={imageRef}
                src={imageUrl}
                alt={t("user.avatar.previewAlt")}
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
                }}
                onError={() => setError(t("user.avatar.loadFailed"))}
                className="absolute left-1/2 top-1/2 max-w-none select-none"
                style={{
                  width: imageReady ? imageSize.width * baseScale : undefined,
                  height: imageReady ? imageSize.height * baseScale : undefined,
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                }}
              />
            ) : null}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border border-white/90 shadow-[0_0_0_999px_rgba(255,255,255,0.48)]"
              style={{
                width: cropSize,
                height: cropSize,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
          <div className="mt-4 flex h-10 items-center gap-2 rounded-md bg-bg-elevated px-2">
            <button
              type="button"
              aria-label={t("imageRenderer.zoomOut")}
              title={t("imageRenderer.zoomOut")}
              disabled={!canZoomOut || loading}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-brand/20 bg-brand/10 text-brand shadow-sm transition-colors hover:bg-brand/15 disabled:pointer-events-none disabled:border-border-subtle disabled:bg-bg-base disabled:text-text-tertiary disabled:opacity-60"
              onClick={() => updateZoom(zoom - ZOOM_STEP)}
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              aria-label={t("imageRenderer.zoomIn")}
              title={t("imageRenderer.zoomIn")}
              disabled={!canZoomIn || loading}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-brand/20 bg-brand/10 text-brand shadow-sm transition-colors hover:bg-brand/15 disabled:pointer-events-none disabled:border-border-subtle disabled:bg-bg-base disabled:text-text-tertiary disabled:opacity-60"
              onClick={() => updateZoom(zoom + ZOOM_STEP)}
            >
              <ZoomIn size={18} />
            </button>
          </div>
          {error ? <p className="text-xs text-error">{error}</p> : null}
        </div>
      </div>
    </BaseDialog>
  );
}
