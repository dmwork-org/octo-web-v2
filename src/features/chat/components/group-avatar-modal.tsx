import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { type Channel } from "wukongimjssdk";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/semi-bridge/button";
import { toast } from "@/components/semi-bridge/toast";
import { endpointStore } from "@/features/base/stores/endpoint";
import { useDrawerEnterTransition } from "@/features/chat/hooks/use-drawer-enter-transition.hook";
import { uploadGroupAvatar } from "@/features/base/api/endpoints/group.api";

interface GroupAvatarModalProps {
  open: boolean;
  channel: Channel;
  channelTitle: string;
  canEdit: boolean;
  onClose: () => void;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * 群头像二级抽屉(对应旧 dmworkbase ChannelAvatar):
 *
 *   ┌ Header(← + 群头像)
 *   ├ 大图(200×200,圆角)
 *   └ [ 更换头像 ] 按钮(canEdit;选完直接上传,不做 crop)
 *
 * 缓存破坏:用 imgVersion 在 url 末尾加 ?v={ts},上传成功后 +1 强制刷新该 <img>。
 * 旧版 WKApp.shared.changeChannelAvatarTag 同思路。
 *
 * 不做 crop(crop 依赖图片处理库,后续 components/media 再补)— 保留原图直传。
 */
export function GroupAvatarModal({
  open,
  channel,
  channelTitle,
  canEdit,
  onClose,
}: GroupAvatarModalProps) {
  const baseURL = useStore(endpointStore, (s) => s.baseURL);
  const entered = useDrawerEnterTransition(open);
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
      toast.success("已更换群头像");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "上传失败"),
  });

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重选同一文件
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(`图片不能超过 ${MAX_AVATAR_BYTES / 1024 / 1024}MB`);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    uploadMu.mutate(file);
  };

  if (!open) return null;

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
          <h2 className="text-sm font-semibold text-text-primary">群头像</h2>
        </header>

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
                {uploadMu.isPending ? "上传中…" : "更换头像"}
              </Button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
