import { Store } from "@tanstack/react-store";

export interface SpaceState {
  spaceId: string | null;
}

const STORAGE_KEY = "octo:space";

function readPersisted(): SpaceState {
  if (typeof window === "undefined") return { spaceId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return { spaceId: raw && raw.length > 0 ? raw : null };
  } catch {
    return { spaceId: null };
  }
}

export const spaceStore = new Store<SpaceState>(readPersisted());

export const spaceActions = {
  setSpace: (spaceId: string | null) => spaceStore.setState(() => ({ spaceId })),
};

export function persistSpace(): void {
  if (typeof window === "undefined") return;
  spaceStore.subscribe(() => {
    try {
      const { spaceId } = spaceStore.state;
      if (spaceId) {
        window.localStorage.setItem(STORAGE_KEY, spaceId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  });
}

/**
 * channelSpaceMap — channel(by `${channelID}_${channelType}` key)→ spaceId 反查表。
 *
 * 在 syncConversationsCallback 内,响应每条 conversation 都带 space_id;预填这张表后,
 * 业务层(矩阵转发 / 跨 Space 跳转)能反查某 channel 属于哪个 Space,不用再调接口。
 *
 * 旧项目挂在 `WKApp.shared.channelSpaceMap`(Map<string, string>),这里用模块级
 * 单例 Map 等价(非 react state,不需要订阅 — 业务调用方直接读)。
 */
export const channelSpaceMap = new Map<string, string>();

export function channelSpaceKey(channelId: string, channelType: number): string {
  return `${channelId}_${channelType}`;
}
