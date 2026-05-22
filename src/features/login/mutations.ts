import { useMutation } from "@tanstack/react-query";
import { api } from "@/features/base/api/client";
import type { AuthUser } from "@/features/base/stores/auth";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      api<LoginResult>("/auth/login", { method: "POST", body: payload }),
  });
}
