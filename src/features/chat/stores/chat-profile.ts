import { Store } from "@tanstack/react-store";

/**
 * chat profile 弹窗状态 — 任意点击(mention / 头像)触发,chat.view 顶部 mount
 * UserInfoModal / BotDetailModal 受其控制(对应旧 dmworkbase WKApp.shared.
 * baseContext.showUserInfo / showBotDetail)。
 */
export interface ChatProfileState {
  kind: "user" | "bot" | null;
  uid: string | null;
}

export const chatProfileStore = new Store<ChatProfileState>({
  kind: null,
  uid: null,
});

export const chatProfileActions = {
  openUser: (uid: string) => chatProfileStore.setState(() => ({ kind: "user", uid })),
  openBot: (uid: string) => chatProfileStore.setState(() => ({ kind: "bot", uid })),
  close: () => chatProfileStore.setState(() => ({ kind: null, uid: null })),
};
