import { ofetch } from "ofetch";

export const api = ofetch.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api",
  onResponseError({ response }) {
    console.error("[api] response error", response.status, response._data);
  },
});
