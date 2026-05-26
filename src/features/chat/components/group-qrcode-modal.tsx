import { useQuery } from "@tanstack/react-query";
import { type Channel } from "wukongimjssdk";
import { ArrowLeft } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { useDrawerEnterTransition } from "@/features/chat/hooks/use-drawer-enter-transition.hook";
import { getGroupQrcode } from "@/features/base/api/endpoints/group.api";

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
 * 群二维码二级抽屉(对应旧 dmworkbase ChannelQRCode):
 *
 *   ┌ Header(← + 群二维码名片)
 *   ├ 群头像 + 群名
 *   ├ 二维码大图(进群验证开启时蒙层提示"只可通过邀请进群")
 *   ├ 失效时间提示(7 天内 xxx 前有效)
 *   └ [ 复制邀请链接 ] 按钮(进群验证开启时不显示)
 *
 * z-index:70(在 channel-setting=50 / channel-members=60 之上)。
 */
export function GroupQrcodeModal({
  open,
  channel,
  channelTitle,
  inviteVerifyOn,
  onClose,
}: GroupQrcodeModalProps) {
  const entered = useDrawerEnterTransition(open);
  const qrQ = useQuery({
    queryKey: ["chat", "group-qrcode", channel.channelID],
    queryFn: () => getGroupQrcode(channel.channelID),
    enabled: open,
    staleTime: 60 * 1000,
  });

  if (!open) return null;

  const onCopy = async () => {
    const link = qrQ.data?.invite_url || qrQ.data?.qrcode || "";
    if (!link) return;
    const ok = await copyToClipboard(link);
    if (ok) toast.success("邀请链接已复制,7 天内有效");
    else toast.error("复制失败,请手动复制");
  };

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute top-0 right-0 flex h-full w-full max-w-md transform flex-col overflow-hidden border-l border-border-default bg-bg-surface shadow-xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-text-primary">群二维码名片</h2>
        </header>

        <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-6">
          <div className="flex flex-col items-center gap-3">
            <ChannelAvatar channel={channel} size={56} title={channelTitle} />
            <h3 className="text-base font-semibold text-text-primary">{channelTitle}</h3>
          </div>

          <div className="relative mt-6 flex h-64 w-64 items-center justify-center rounded-lg border border-border-subtle bg-white p-4">
            {qrQ.isLoading ? (
              <span className="text-sm text-text-tertiary">加载中…</span>
            ) : qrQ.error ? (
              <span className="text-sm text-error">
                {qrQ.error instanceof Error ? qrQ.error.message : "加载失败"}
              </span>
            ) : qrQ.data ? (
              <QRCodeSVG value={qrQ.data.qrcode} size={224} fgColor="#000000" />
            ) : null}
            {inviteVerifyOn && qrQ.data ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/85 text-center text-[13px] text-text-secondary">
                <p>该群已开启进群验证</p>
                <p>只可通过邀请进群</p>
              </div>
            ) : null}
          </div>

          {qrQ.data ? (
            <p className="mt-4 text-[12px] text-text-tertiary">
              该二维码 7 天内({qrQ.data.expire})前有效,重新进入将更新
            </p>
          ) : null}

          {qrQ.data && !inviteVerifyOn ? (
            <div className="mt-6">
              <Button type="primary" theme="solid" onClick={onCopy}>
                复制邀请链接
              </Button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
