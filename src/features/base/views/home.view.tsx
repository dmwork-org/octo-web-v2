import { useStore } from "@tanstack/react-store";
import { authActions, authStore } from "@/features/base/stores/auth";

export function HomeView() {
  const user = useStore(authStore, (s) => s.user);
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">octo-web</h1>
      <p className="text-sm opacity-70">Logged in as {user?.name ?? "anonymous"}</p>
      <button
        type="button"
        className="mt-4 rounded border px-3 py-1.5 text-sm hover:bg-gray-50"
        onClick={() => authActions.signOut()}
      >
        Sign out
      </button>
    </div>
  );
}
