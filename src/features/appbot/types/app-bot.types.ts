/**
 * App Bot 类型,对齐旧 dmworkappbot/AppBotPage.tsx AppBotInfo。
 * - scope: "platform" 平台级 bot(对所有 Space 可见);"space" 当前 Space 私有
 */

export type AppBotScope = "platform" | "space";

export interface AppBotInfo {
  id: string;
  uid: string;
  display_name: string;
  description?: string;
  avatar?: string;
  scope: AppBotScope;
}
