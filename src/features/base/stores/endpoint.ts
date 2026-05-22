import { Store } from "@tanstack/react-store";

export interface EndpointState {
  baseURL: string;
}

const DEFAULT_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const STORAGE_KEY = "octo:endpoint";

function readPersisted(): EndpointState {
  if (typeof window === "undefined") return { baseURL: DEFAULT_BASE_URL };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { baseURL: raw && raw.length > 0 ? raw : DEFAULT_BASE_URL };
  } catch {
    return { baseURL: DEFAULT_BASE_URL };
  }
}

export const endpointStore = new Store<EndpointState>(readPersisted());

export const endpointActions = {
  setBaseURL: (baseURL: string) => endpointStore.setState(() => ({ baseURL })),
  reset: () => endpointStore.setState(() => ({ baseURL: DEFAULT_BASE_URL })),
};

export function persistEndpoint(): void {
  if (typeof window === "undefined") return;
  endpointStore.subscribe(() => {
    try {
      const { baseURL } = endpointStore.state;
      if (baseURL && baseURL !== DEFAULT_BASE_URL) {
        window.localStorage.setItem(STORAGE_KEY, baseURL);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  });
}
