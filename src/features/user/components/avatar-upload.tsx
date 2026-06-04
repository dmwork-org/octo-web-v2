import { useRef, useState } from "react";
import { useUploadAvatarMutation } from "@/features/user/mutations";
import { Button } from "@/components/semi-bridge/button";

interface AvatarUploadProps {
  uid: string;
  currentAvatar?: string;
  name: string;
}

/**
 * 头像上传(简化版,无裁剪 — 老仓有 WKAvatarEditor 裁剪,本期暂用浏览器原生
 * 文件选择,直接上传整图)。
 *
 * - <input type="file" accept="image/*"> 隐藏
 * - 点击头像 → 打开文件选择 → 上传 → invalidate user detail
 * - 上传中显 loading 蒙层
 */
export function AvatarUpload({ uid, currentAvatar, name }: AvatarUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadMu = useUploadAvatarMutation(uid);
  const [error, setError] = useState<string | null>(null);

  const onSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await uploadMu.mutateAsync(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const initial = (name ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        {currentAvatar ? (
          <img
            src={currentAvatar}
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
          上传头像
        </Button>
        {error ? <p className="text-xs text-error">{error}</p> : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onSelectFile(e)}
        className="hidden"
      />
    </div>
  );
}
