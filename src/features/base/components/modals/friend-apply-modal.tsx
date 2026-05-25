import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { applyFriend } from "@/features/contacts/api/friends.api";

interface FriendApplyModalProps {
  open: boolean;
  /** 申请目标 uid */
  toUid: string;
  /** 验证码(从 search 结果 / channelInfo 拿,后端发的一次性凭证) */
  vercode?: string;
  /** 默认填的备注文案(旧版区分:"我想使用 botName" / "我是群聊 X 的 Y") */
  defaultMessage?: string;
  /** Modal 标题 */
  title?: string;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * 好友申请弹窗(对应旧 dmworkbase Components/FriendApply 由 RoutePage push)。
 *
 * 简化:旧版用 RoutePage push + RouteContext.FinishButton 控制 disable/loading;
 * 新版用 Tailwind modal + Mutation pending 控制按钮 disable/loading,语义等价。
 *
 * - textarea 编辑备注(必填,默认填 defaultMessage)
 * - 提交 → POST /v1/friend/apply { to_uid, remark, vercode }
 * - 成功 toast + onSuccess(通常关闭外层 UserInfo modal)
 */
export function FriendApplyModal({
  open,
  toUid,
  vercode,
  defaultMessage = "",
  title = "申请添加朋友",
  onClose,
  onSuccess,
}: FriendApplyModalProps) {
  const [message, setMessage] = useState(defaultMessage);

  // 每次 open 重置 message 为 defaultMessage(避免连续打开看到旧值)
  useResetMessageOnOpen(open, defaultMessage, setMessage);

  const mu = useMutation({
    mutationFn: () => applyFriend({ to_uid: toUid, remark: message.trim(), vercode }),
    onSuccess: () => {
      toast.success("好友申请已发送");
      onSuccess();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "申请失败"),
  });

  if (!open) return null;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || mu.isPending) return;
    mu.mutate();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>
        <form onSubmit={onSubmit} className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">发送验证申请</span>
            <textarea
              autoFocus
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="resize-none rounded-md border border-border-default bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
            />
          </label>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button type="tertiary" theme="borderless" onClick={onClose}>
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              theme="solid"
              loading={mu.isPending}
              disabled={!message.trim()}
            >
              发送
            </Button>
          </div>
        </form>
      </div>
    </div>
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
