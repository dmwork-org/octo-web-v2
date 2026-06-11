import { useRef, useState, type ChangeEvent } from "react";
import { useStore } from "@tanstack/react-store";
import { useUploadAvatarMutation } from "@/features/user/mutations";
import { AvatarCropModal } from "@/features/user/components/avatar-crop-modal";
import { avatarVersionStore } from "@/features/base/stores/avatar-version";
import { Button } from "@/components/semi-bridge/button";
import { useT } from "@/lib/i18n/use-t";
import { t as tInst } from "@/lib/i18n/instance";

interface AvatarUploadProps {
  uid: string;
  currentAvatar?: string;
  name: string;
}

function withVersion(url: string | undefined, version: number): string | undefined {
  if (!url || version <= 0 || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

function isGif(file: File): boolean {
  return file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
}

/** 头像上传:普通图片进入裁剪编辑器,GIF 保留原文件直传以避免丢失动画帧。 */
export function AvatarUpload({ uid, currentAvatar, name }: AvatarUploadProps) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMu = useUploadAvatarMutation(uid);
  const avatarVersion = useStore(avatarVersionStore, (s) => s.versions[uid] ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarUrl = withVersion(currentAvatar, avatarVersion);

  const onSelectFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (isGif(file)) {
      void onUpload(file);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setCropFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onUpload = async (file: File) => {
    try {
      await uploadMu.mutateAsync(file);
      setCropFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tInst("user.avatar.uploadFailed"));
    }
  };

  const initial = (name ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="h-16 w-16 rounded-full bg-bg-elevated object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated text-2xl text-text-secondary">
            {initial}
          </div>
        )}
        {uploadMu.isPending ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Button onClick={() => fileRef.current?.click()} disabled={uploadMu.isPending}>
          {t("user.avatar.uploadBtn")}
        </Button>
        {error ? <p className="text-xs text-error">{error}</p> : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => onSelectFile(e)}
        className="hidden"
      />
      <AvatarCropModal
        open={!!cropFile}
        file={cropFile}
        loading={uploadMu.isPending}
        onCancel={() => setCropFile(null)}
        onConfirm={(file) => void onUpload(file)}
      />
    </div>
  );
}
