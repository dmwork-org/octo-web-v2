import type { FetchContext, FetchResponse } from "ofetch";
import type { Store } from "@tanstack/react-store";
import type { AuthState } from "@/features/base/stores/auth";
import { toast } from "@/components/semi-bridge/toast";
import { router } from "@/lib/router";

type ResponseCtx = FetchContext & { response: FetchResponse<unknown> };

export const with401Redirect =
  (store: Store<AuthState>) =>
  ({ response }: ResponseCtx) => {
    if (response.status !== 401) return;
    store.setState(() => ({ token: null, user: null }));
    const redirectTo = encodeURIComponent(window.location.href);
    void router.navigate({ href: `/login?redirect=${redirectTo}` });
  };

export const withErrorToast =
  () =>
  ({ response }: ResponseCtx) => {
    const data = response._data as { message?: string; msg?: string } | undefined;
    const msg = data?.message ?? data?.msg ?? response.statusText ?? "Request failed";
    toast.error(msg);
  };
