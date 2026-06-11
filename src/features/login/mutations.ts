import { useMutation } from "@tanstack/react-query";
import { api } from "@/features/base/api/client";
import {
  registerByEmail as apiRegisterByEmail,
  registerByUsername as apiRegisterByUsername,
  sendEmailCode as apiSendEmailCode,
  resetPassword as apiResetPassword,
  type LoginResp,
} from "@/features/base/api/endpoints/user.api";
import { buildDevicePayload } from "@/features/login/lib/device";
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
        // silent:login.view 用 loginErrorText inline 展示错误,
        // 不绕过 withErrorToast 会"全局 toast + inline error"重复(issue #91 同因)。
        silent: true,
      } as Parameters<typeof api<LoginResponse>>[1]);
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

// ---------------------------------------------------------------------------
// 注册 / 找回密码 mutations(块 3/4 新增)
// ---------------------------------------------------------------------------

/** 发送验证码 — code_type 0=注册 / 2=找回密码。 */
export function useSendEmailCodeMutation() {
  return useMutation({
    mutationFn: async (params: { email: string; codeType: 0 | 2 }) => {
      await apiSendEmailCode(params.email, params.codeType);
    },
  });
}

/** 邮箱注册 — 邮箱 + 验证码 + 昵称 + 密码 → LoginResp(直接登录)。 */
export function useRegisterByEmailMutation() {
  return useMutation({
    mutationFn: async (params: {
      email: string;
      code: string;
      name: string;
      password: string;
    }): Promise<LoginResp> => {
      return apiRegisterByEmail({
        email: params.email,
        password: params.password,
        name: params.name,
        code: params.code,
        device: buildDevicePayload(),
      });
    },
  });
}

/** 用户名注册(兜底) — username + name + password → LoginResp。 */
export function useRegisterByUsernameMutation() {
  return useMutation({
    mutationFn: async (params: {
      username: string;
      name: string;
      password: string;
    }): Promise<LoginResp> => {
      return apiRegisterByUsername({
        username: params.username,
        name: params.name,
        password: params.password,
        device: buildDevicePayload(),
      });
    },
  });
}

/** 找回密码 — 邮箱 + 验证码 + 新密码 → void。 */
export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (params: { email: string; code: string; new_password: string }) => {
      await apiResetPassword(params);
    },
  });
}
