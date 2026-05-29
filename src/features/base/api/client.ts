import { $fetch } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { endpointStore } from "@/features/base/stores/endpoint";
import { createClientOptions } from "./interceptors/factory";

export const api = $fetch.create(
  createClientOptions({
    authStore,
    spaceStore,
    baseURL: endpointStore.state.baseURL,
  }),
);
