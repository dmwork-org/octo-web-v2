import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Channel } from "wukongimjssdk";
import { Button } from "@/components/semi-bridge/button";
import { message } from "@/components/ui/message";
import { endpointStore } from "@/features/base/stores/endpoint";
import { BaseDrawer } from "@/features/base/components/overlay/base-drawer";
import { uploadGroupAvatar } from "@/features/base/api/endpoints/group.api";
import { useT } from "@/lib/i18n/use-t";
import { t } from "@/lib/i18n/instance";

interface GroupAvatarModalProps {
  open: boolean;
  channel: Channel;
  channelTitle: string;
  canEdit: boolean;
  onClose: () => void;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * 群头像二级抽屉(对应旧 dmworkbase ChannelAvatar)。
 *
 * 浮动元素壳层统一规范 Phase D — 走 BaseDrawer side=right + ← 返回头部。
 */
export function GroupAvatarModal({
  open,
  channel,
  channelTitle,
  canEdit,
  onClose,
}: GroupAvatarModalProps) {
  const tt = useT();
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const [imgVersion, setImgVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
  const logo = channelInfo?.logo;
  const url = (() => {
    let base: string;
    if (logo) {
      if (logo.startsWith("data:") || logo.startsWith("http://") || logo.startsWith("https://")) {
        base = logo;
      } else {
        base = `${baseURL}/${logo.replace(/^\/+/, "")}`;
      }
    } else {
      base = `${baseURL}/groups/${channel.channelID}/avatar`;
    }
    return imgVersion > 0 ? `${base}${base.includes("?") ? "&" : "?"}v=${imgVersion}` : base;
  })();

  const uploadMu = useMutation({
    mutationFn: (file: File) => uploadGroupAvatar(channel.channelID, file),
    onSuccess: () => {
      void WKSDK.shared().channelManager.fetchChannelInfo(channel);
      setImgVersion(Date.now());
      message.success(t("groupAvatar.toast.updated"));
    },
    onError: (err) =>
      message.error(err instanceof Error ? err.message : t("groupAvatar.toast.uploadFailed")),
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重选同一文件
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      message.error(
        t("groupAvatar.toast.tooLarge", { values: { mb: MAX_AVATAR_BYTES / 1024 / 1024 } }),
      );
      return;
    }
    if (!file.type.startsWith("image/")) {
      message.error(t("groupAvatar.toast.imageOnly"));
      return;
    }
    uploadMu.mutate(file);
  };

  return (
    <BaseDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      side="right"
      size="md"
      title={tt("groupAvatar.title")}
      showBackButton
      showCloseButton={false}
      onBack={onClose}
    >
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8">
        <div className="flex h-50 w-50 items-center justify-center overflow-hidden rounded-lg bg-bg-elevated">
          <img
            src={url}
            alt={channelTitle}
            className="h-full w-full object-cover"
            style={{ width: 200, height: 200 }}
          />
        </div>

        {canEdit ? (
          <div className="mt-6">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              type="primary"
              theme="solid"
              loading={uploadMu.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {uploadMu.isPending ? tt("groupAvatar.uploading") : tt("groupAvatar.change")}
            </Button>
          </div>
        ) : null}
      </div>
    </BaseDrawer>
  );
}
