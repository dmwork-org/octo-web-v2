import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";
import { FriendAddForm } from "@/features/chat/components/friend-add-form";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";

interface FriendAddModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 添加朋友 modal(对应旧 dmworkcontacts FriendAdd 二级页 → modal)。
 *
 * 浮动元素壳层统一规范 Phase C — 走 BaseDialog。
 */
export function FriendAddModal({ open, onClose }: FriendAddModalProps) {
  const shortNo = useStore(authStore, (s) => s.user?.short_no ?? "");
  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      height="sm"
      title="添加朋友"
      contentClassName="overflow-hidden"
    >
      {shortNo ? (
        <div className="shrink-0 border-b border-border-subtle px-5 py-2 text-[12px] text-text-tertiary">
          我的短号:<span className="text-text-secondary">{shortNo}</span>
        </div>
      ) : null}
      <FriendAddForm />
    </BaseDialog>
  );
}
