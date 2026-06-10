import { Store } from "@tanstack/react-store";

interface AvatarVersionState {
  versions: Record<string, number>;
}

export const avatarVersionStore = new Store<AvatarVersionState>({
  versions: {},
});

export function avatarVersionFor(uid: string): number {
  return avatarVersionStore.state.versions[uid] ?? 0;
}

export const avatarVersionActions = {
  bump: (uid: string): number => {
    const version = Date.now();
    avatarVersionStore.setState((state) => ({
      versions: {
        ...state.versions,
        [uid]: version,
      },
    }));
    return version;
  },
};
