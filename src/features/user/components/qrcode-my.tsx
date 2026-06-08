import { QRCodeSVG } from "qrcode.react";
import { useT } from "@/lib/i18n/use-t";

interface QrcodeMyProps {
  uid: string;
  name: string;
  /** 二维码内 payload(对齐老仓 QRCodeMy 用 user:{uid} 作为 deep link)。 */
  payload?: string;
}

/** 我的二维码(对齐老仓 QRCodeMy):中心 200×200,底部显示 name。 */
export function QrcodeMy({ uid, name, payload }: QrcodeMyProps) {
  const t = useT();
  const value = payload ?? `user:${uid}`;
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-border-subtle p-4">
      <QRCodeSVG value={value} size={160} level="M" />
      <p className="text-sm font-medium text-text-primary">{name}</p>
      <p className="text-[11px] text-text-tertiary">{t("user.qrcode.scanToAdd")}</p>
    </div>
  );
}
