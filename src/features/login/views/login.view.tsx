import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authActions } from "@/features/base/stores/auth";
import { useLoginMutation } from "@/features/login/mutations";
import { Button } from "@/components/semi-bridge/button";

interface LoginViewProps {
  redirect?: string;
}

function readBackendMessage(err: unknown): string {
  if (!err || typeof err !== "object") return "Sign in failed";
  const e = err as { data?: { msg?: unknown; message?: unknown }; message?: string };
  const msg = e.data?.msg ?? e.data?.message;
  if (typeof msg === "string" && msg.length > 0) return msg;
  if (typeof e.message === "string" && e.message.length > 0) return e.message;
  return "Sign in failed";
}

export function LoginView({ redirect }: LoginViewProps) {
  const navigate = useNavigate();
  const mutation = useLoginMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { token, user } = await mutation.mutateAsync({ username, password });
    authActions.signIn(token, user);
    void navigate({ href: redirect ?? "/", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base">
      <form
        onSubmit={onSubmit}
        className="w-80 rounded-lg border border-border-default bg-bg-surface p-6 shadow-sm"
        aria-label="login form"
      >
        <h1 className="mb-4 text-xl font-semibold text-text-primary">登录</h1>
        <label className="mb-3 block text-sm text-text-secondary">
          用户名
          <input
            type="text"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="mb-4 block text-sm text-text-secondary">
          密码
          <input
            type="password"
            className="mt-1 w-full rounded border border-border-default bg-bg-surface px-2 py-1.5 text-text-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {mutation.isError && (
          <p className="mb-3 text-xs text-error">{readBackendMessage(mutation.error)}</p>
        )}
        <Button
          htmlType="submit"
          type="primary"
          theme="solid"
          loading={mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? "登录中…" : "登录"}
        </Button>
      </form>
    </div>
  );
}
