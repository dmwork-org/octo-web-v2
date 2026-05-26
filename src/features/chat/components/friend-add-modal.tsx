import { useStore } from "@tanstack/react-store";
import { X } from "lucide-react";
import { authStore } from "@/features/base/stores/auth";
import { FriendAdd } from "@/features/contacts/components/friend-add";

interface FriendAddModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 添加朋友 modal(对应旧 dmworkcontacts FriendAdd 二级页 → 改为 modal):
 *
 *   ┌ Header(添加朋友 + X) ┐
 *   ├ 我的短号:{shortNo}    │
 *   ├ FriendAdd 内嵌            │  ← 搜索 + 结果列表 + 加好友按钮
 *   └─────────────────────┘
 *
 * 旧版还有"我的二维码"入口(QRCodeMy),后续 P3+ 再接(需要 user/qrcode API +
 * qrcode.react 渲染)。
 *
 * FriendAdd 本身已包含搜索 + 申请加好友逻辑,本 modal 只提供壳 + 头部 short_no 提示。
 */
export function FriendAddModal({ open, onClose }: FriendAddModalProps) {
  const shortNo = useStore(authStore, (s) => s.user?.short_no ?? "");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface shadow-xl">
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
          <h2 className="text-sm font-semibold text-text-primary">添加朋友</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-hover hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </header>

        {shortNo ? (
          <div className="shrink-0 border-b border-border-subtle px-5 py-2 text-[12px] text-text-tertiary">
            我的短号:<span className="text-text-secondary">{shortNo}</span>
          </div>
        ) : null}

        <FriendAdd />
      </div>
    </div>
  );
}
