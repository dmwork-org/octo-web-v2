import { useMutation } from "@tanstack/react-query";
import { api } from "@/features/base/api/client";
import type { AuthUser } from "@/features/base/stores/auth";

export const DEVICE_FLAG_PC = 1;

export interface LoginDevice {
  device_id: string;
  device_name: string;
  device_model: string;
}

export interface LoginPayload {
  username: string;
  password: string;
  flag?: number;
  device?: LoginDevice;
}

export interface LoginResponse extends AuthUser {
  token: string;
  sex?: number;
  category?: string;
  chat_pwd?: string;
  lock_screen_pwd?: string;
  lock_after_minute?: number;
  rsa_public_key?: string;
  short_status?: number;
  msg_expire_second?: number;
  realname_verified?: boolean;
  real_name?: string;
  realname_verified_at?: number;
  destroy_status?: number;
  destroy_remaining_days?: number;
  destroy_expire_at?: number;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  raw: LoginResponse;
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: async (payload: LoginPayload): Promise<LoginResult> => {
      const resp = await api<LoginResponse>("user/login", {
        method: "POST",
        body: {
          username: payload.username,
          password: payload.password,
          flag: payload.flag ?? DEVICE_FLAG_PC,
          device: payload.device,
        },
      });
      const user: AuthUser = {
        uid: resp.uid,
        name: resp.name,
        username: resp.username,
        app_id: resp.app_id,
        short_no: resp.short_no,
        zone: resp.zone,
        phone: resp.phone,
      };
      return { token: resp.token, user, raw: resp };
    },
  });
}
