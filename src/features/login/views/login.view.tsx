import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authActions } from "@/features/base/stores/auth";
import { useLoginMutation } from "@/features/login/mutations";

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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={onSubmit}
        className="w-80 rounded-lg border bg-white p-6 shadow-sm"
        aria-label="login form"
      >
        <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
        <label className="mb-3 block text-sm">
          Username
          <input
            type="text"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="mb-4 block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded border px-2 py-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {mutation.isError && (
          <p className="mb-3 text-xs text-red-600">{readBackendMessage(mutation.error)}</p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
