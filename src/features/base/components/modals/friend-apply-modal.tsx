import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/semi-bridge/button";
import { message as appMessage } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { applyFriend } from "@/features/contacts/api/friends.api";

interface FriendApplyModalProps {
  open: boolean;
  /** 申请目标 uid */
  toUid: string;
  /** 验证码(从 search 结果 / channelInfo 拿,后端发的一次性凭证) */
  vercode?: string;
  /** 默认填的备注文案 */
  defaultMessage?: string;
  /** Modal 标题 */
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 好友申请弹窗(对应旧 dmworkbase Components/FriendApply)。
 *
 * 浮动元素壳层统一规范 Phase C — 走 BaseDialog。
 */
export function FriendApplyModal({
  open,
  toUid,
  vercode,
  defaultMessage = "",
  title,
  onClose,
  onSuccess,
}: FriendApplyModalProps) {
  const t = useT();
  const [message, setMessage] = useState(defaultMessage);
  const effectiveTitle = title ?? t("base.friendApply.titleDefault");

  useResetMessageOnOpen(open, defaultMessage, setMessage);

  const mu = useMutation({
    mutationFn: () => applyFriend({ to_uid: toUid, remark: message.trim(), vercode }),
    onSuccess: () => {
      appMessage.success(t("base.friendApply.sent"));
      onSuccess();
    },
    onError: (err) =>
      appMessage.error(err instanceof Error ? err.message : t("base.friendApply.failed")),
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || mu.isPending) return;
    mu.mutate();
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="sm"
      title={effectiveTitle}
      footer={
        <>
          <Button type="tertiary" theme="borderless" onClick={onClose}>
            {t("base.common.cancel")}
          </Button>
          <Button
            htmlType="submit"
            form="friend-apply-form"
            type="primary"
            theme="solid"
            loading={mu.isPending}
            disabled={!message.trim()}
          >
            {t("base.common.send")}
          </Button>
        </>
      }
      contentClassName="p-5"
    >
      <form id="friend-apply-form" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">
            {t("base.friendApply.label")}
          </span>
          <textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
          />
        </label>
      </form>
    </BaseDialog>
  );
}

/** 命名 hook 包裹 effect:open 翻转时 reset message 到 defaultMessage。 */
function useResetMessageOnOpen(
  open: boolean,
  defaultMessage: string,
  setMessage: (m: string) => void,
) {
  useEffect(() => {
    if (open) setMessage(defaultMessage);
  }, [open, defaultMessage, setMessage]);
}
