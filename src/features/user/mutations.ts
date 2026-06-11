import { useMutation, useQueryClient } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypePerson } from "wukongimjssdk";
import {
  updateCurrentUser,
  uploadAvatar,
  type UpdateCurrentPayload,
} from "@/features/base/api/endpoints/user.api";
import { userDetailQueryKey } from "@/features/base/queries/user.query";
import { avatarVersionActions } from "@/features/base/stores/avatar-version";

/**
 * MeInfo 写操作 mutations(对齐老仓 MeInfo/vm.tsx)。
 *
 * 成功后 invalidate `["user","detail",uid]` 触发 MeInfo / sidebar / 头像位置自动重渲。
 */

export function useUpdateCurrentUserMutation(uid: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCurrentPayload) => updateCurrentUser(payload),
    onSuccess: () => {
      if (uid) void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid) });
    },
  });
}

export function useUploadAvatarMutation(uid: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File | Blob) => {
      if (!uid) return Promise.reject(new Error("missing uid"));
      return uploadAvatar(uid, file);
    },
    onSuccess: () => {
      if (!uid) return;
      avatarVersionActions.bump(uid, ChannelTypePerson);
      void WKSDK.shared().channelManager.fetchChannelInfo(new Channel(uid, ChannelTypePerson));
      void qc.invalidateQueries({ queryKey: userDetailQueryKey(uid) });
    },
  });
}
