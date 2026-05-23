/**
 * 复制图片到剪贴板(对应旧 dmworkbase Service/CopyImage)。
 *
 * 用 Clipboard API 的 write([ClipboardItem]) 把图片 blob 放入剪贴板。
 * 浏览器要求:
 * - HTTPS 或 localhost(Clipboard API 受 SecureContext 限制)
 * - 用户手势触发(右键 → 点击 menu item 触发,符合)
 * - 大多浏览器只接受 image/png(image/jpeg 也支持,新版 Chrome)
 *
 * 流程:fetch 图片 url → blob → ClipboardItem → navigator.clipboard.write。
 * 若浏览器不支持 image/jpeg,fetch 后用 canvas 转 png 兜底。
 *
 * 失败抛 Error,调用方 catch 走 toast。
 */
export async function copyImageToClipboard(url: string): Promise<void> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("浏览器不支持复制图片");
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error("图片加载失败");
  }
  const blob = await resp.blob();

  // 直接尝试用原始 MIME。失败(浏览器不支持 image/jpeg 等)则转 png 重试。
  try {
    const item = new ClipboardItem({ [blob.type]: blob });
    await navigator.clipboard.write([item]);
    return;
  } catch {
    // fallthrough to PNG conversion
  }

  const pngBlob = await convertToPng(blob);
  const item = new ClipboardItem({ "image/png": pngBlob });
  await navigator.clipboard.write([item]);
}

function convertToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 上下文创建失败"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("PNG 转换失败"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片解码失败"));
    };
    img.src = url;
  });
}
