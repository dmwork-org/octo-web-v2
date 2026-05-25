import { $fetch, type FetchOptions } from "ofetch";
import { authStore } from "@/features/base/stores/auth";
import { spaceStore } from "@/features/base/stores/space";
import { endpointStore } from "@/features/base/stores/endpoint";
import { withAuthToken, withSpaceHeader, withReqId } from "./interceptors/request";
import { with401Redirect, withErrorToast } from "./interceptors/response";

const options: FetchOptions = {
  baseURL: endpointStore.state.baseURL,
  onRequest: [withAuthToken(authStore), withSpaceHeader(spaceStore), withReqId()],
  onResponseError: [with401Redirect(authStore), withErrorToast()],
};

export const api = $fetch.create(options);
