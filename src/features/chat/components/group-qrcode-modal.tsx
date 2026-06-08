import { useQuery } from "@tanstack/react-query";
import { type Channel } from "wukongimjssdk";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { getGroupQrcode } from "@/features/base/api/endpoints/group.api";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface GroupQrcodeModalProps {
  open: boolean;
  channel: Channel;
  channelTitle: string;
  /** 后端 channelInfo.orgData.invite === 1 表示开了进群验证,二维码失效。 */
  inviteVerifyOn: boolean;
  onClose: () => void;
}

/**
 * 复制文本到剪贴板(对齐旧 utils/clipboard:优先 Clipboard API,fallback execCommand)。
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* 失败 fallback 到 execCommand */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * 群二维码二级抽屉(对应旧 dmworkbase ChannelQRCode)。
 *
 * 浮动元素壳层统一规范 Phase D — 走 BaseDrawer side=right;在 channel-setting
 * 抽屉内开,自动 z-dialog-secondary。header 用 ← 返回(不用 X)。
 */
export function GroupQrcodeModal({
  open,
  channel,
  channelTitle,
  inviteVerifyOn,
  onClose,
}: GroupQrcodeModalProps) {
  const tt = useT();
  const qrQ = useQuery({
    queryKey: ["chat", "group-qrcode", channel.channelID],
    queryFn: () => getGroupQrcode(channel.channelID),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const onCopy = async () => {
    const link = qrQ.data?.invite_url || qrQ.data?.qrcode || "";
    if (!link) return;
    const ok = await copyToClipboard(link);
    if (ok) toast.success(t("groupQrcode.toast.copied"));
    else toast.error(t("groupQrcode.toast.copyFailed"));
  };

  return (
    <BaseDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      size="md"
      title={tt("groupQrcode.title")}
      showBackButton
      showCloseButton={false}
      onBack={onClose}
    >
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
        <div className="flex flex-col items-center gap-3">
          <ChannelAvatar channel={channel} size={56} title={channelTitle} />
          <h3 className="text-base font-semibold text-text-primary">{channelTitle}</h3>
        </div>

        <div className="relative mt-6 flex h-64 w-64 items-center justify-center rounded-lg border border-border-subtle bg-white p-4">
          {qrQ.isLoading ? (
            <span className="text-sm text-text-tertiary">{tt("groupQrcode.loading")}</span>
          ) : qrQ.error ? (
            <span className="text-sm text-error">
              {qrQ.error instanceof Error ? qrQ.error.message : tt("groupQrcode.loadFailed")}
            </span>
          ) : qrQ.data ? (
            <QRCodeSVG value={qrQ.data.qrcode} size={224} fgColor="#000000" />
          ) : null}
          {inviteVerifyOn && qrQ.data ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/85 text-center text-[13px] text-text-secondary">
              <p>{tt("groupQrcode.verifyEnabled")}</p>
              <p>{tt("groupQrcode.inviteOnly")}</p>
            </div>
          ) : null}
        </div>

        {qrQ.data ? (
          <p className="mt-4 text-[12px] text-text-tertiary">
            {tt("groupQrcode.expireHint", { values: { expire: qrQ.data.expire } })}
          </p>
        ) : null}

        {qrQ.data && !inviteVerifyOn ? (
          <div className="mt-6">
            <Button type="primary" theme="solid" onClick={onCopy}>
              {tt("groupQrcode.copyLink")}
            </Button>
          </div>
        ) : null}
      </div>
    </BaseDrawer>
  );
}
