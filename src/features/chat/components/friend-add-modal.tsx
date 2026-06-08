import { useStore } from "@tanstack/react-store";
import { authStore } from "@/features/base/stores/auth";
import { FriendAddForm } from "@/features/chat/components/friend-add-form";
import { BaseDialog } from "@/features/base/components/overlay/base-dialog";
import { useT } from "@/lib/i18n/use-t";

interface FriendAddModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 添加朋友 modal(对应旧 dmworkcontacts FriendAdd 二级页 → modal)。
 */
export function FriendAddModal({ open, onClose }: FriendAddModalProps) {
  const t = useT();
  const shortNo = useStore(authStore, (s) => s.user?.short_no ?? "");
  return (
    <BaseDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="md"
      height="sm"
      title={t("friendAddModal.title")}
      contentClassName="overflow-hidden"
    >
      {shortNo ? (
        <div className="shrink-0 border-b border-border-subtle px-5 py-2 text-[12px] text-text-tertiary">
          {t("friendAddModal.myShortNo")}
          <span className="text-text-secondary">{shortNo}</span>
        </div>
      ) : null}
      <FriendAddForm />
    </BaseDialog>
  );
}
