import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelInfo, ChannelTypePerson } from "wukongimjssdk";
import { Search } from "lucide-react";
import { toast } from "@/components/semi-bridge/toast";
import { t } from "@/lib/i18n/instance";
import { spaceStore } from "@/features/base/stores/space";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import { ChatMain } from "@/features/chat/components/chat-main";
import { applyBot } from "@/features/appbot/api/app-bot.api";
import { appBotsQueryOptions } from "@/features/appbot/queries/app-bots.query";
import { BotRow } from "@/features/appbot/components/bot-row";
import type { AppBotInfo } from "@/features/appbot/types/app-bot.types";

/**
 * 应用主视图(对应旧 dmworkappbot AppBotPage):
 *
 *   ┌ 中列 (320)                ┌ 右列 (flex-1)
 *   │ Header(应用)             │
 *   │ 搜索                     │ ChatMain
 *   │ 平台应用 / 空间应用       │ (chatSelectedStore)
 *   │ BotRow ×                 │
 *   └                            ┘
 *
 * 点 bot:
 * 1. POST /app_bot/apply 申请好友(幂等,旧版同语义)
 * 2. 写 channelInfo cache(displayName/avatar/robot=1),Conversation header / message row
 *    渲染前先有数据,避免显示 uid
 * 3. chatSelectedActions.select(channel) → 右侧 ChatMain 接管
 *
 * Space 切换:useResetOnSpaceChange 清选中(同 matter/summary);bots query 自身按
 * spaceId 维度也会自动 invalidate(main.tsx clear)。
 */
export function AppbotView() {
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const [keyword, setKeyword] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  useResetOnSpaceChange(() => {
    setSelectedUid(null);
    setKeyword("");
  });

  const { data, isLoading, error } = useQuery({
    ...appBotsQueryOptions(spaceId),
    enabled: !!spaceId,
  });

  const bots = data ?? [];
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return bots;
    return bots.filter(
      (b) =>
        (b.display_name || "").toLowerCase().includes(kw) ||
        (b.description || "").toLowerCase().includes(kw),
    );
  }, [bots, keyword]);

  const platformBots = useMemo(() => filtered.filter((b) => b.scope === "platform"), [filtered]);
  const spaceBots = useMemo(() => filtered.filter((b) => b.scope === "space"), [filtered]);

  const applyMu = useMutation({
    mutationFn: (bot: AppBotInfo) => applyBot(bot.uid),
    onSuccess: (_void, bot) => {
      // 写 channelInfo cache(Conversation header 即时显示真名,不等 SDK fetch)
      const channel = new Channel(bot.uid, ChannelTypePerson);
      const info = new ChannelInfo();
      info.channel = channel;
      info.title = bot.display_name;
      info.logo = `users/${bot.uid}/avatar`;
      info.orgData = { displayName: bot.display_name, robot: 1, name: bot.display_name };
      WKSDK.shared().channelManager.setChannleInfoForCache(info);

      // 在 SDK conversations 中预创建一条空会话(用户首次进 bot 还没消息时也能渲染)
      const convMgr = WKSDK.shared().conversationManager;
      if (!convMgr.findConversation(channel) && convMgr.createEmptyConversation) {
        convMgr.createEmptyConversation(channel);
      }

      setSelectedUid(bot.uid);
      chatSelectedActions.select(channel);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("appbot.error.connectFailed")),
  });

  if (!spaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        {t("appbot.state.noSpace")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border-subtle bg-bg-base">
        <header className="flex h-14 shrink-0 items-center border-b border-border-subtle bg-bg-surface px-5 text-base font-semibold text-text-primary">
          {t("appbot.page.title")}
        </header>

        <div className="shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 focus-within:border-brand">
            <Search size={14} className="text-text-tertiary" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("appbot.page.searchPlaceholder")}
              className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {t("appbot.state.loading")}
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center text-sm text-error">
              {t("appbot.state.loadFailed")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
              {keyword ? t("appbot.state.noMatches") : t("appbot.state.empty")}
            </div>
          ) : (
            <>
              {platformBots.length > 0 ? (
                <section className="flex flex-col gap-0.5">
                  <header className="px-3 py-1 text-[11px] font-semibold text-text-tertiary">
                    {t("appbot.section.platform")}
                  </header>
                  {platformBots.map((b) => (
                    <BotRow
                      key={b.id}
                      bot={b}
                      selected={selectedUid === b.uid}
                      onClick={() => applyMu.mutate(b)}
                    />
                  ))}
                </section>
              ) : null}
              {spaceBots.length > 0 ? (
                <section className="flex flex-col gap-0.5">
                  <header className="px-3 py-1 text-[11px] font-semibold text-text-tertiary">
                    {t("appbot.section.space")}
                  </header>
                  {spaceBots.map((b) => (
                    <BotRow
                      key={b.id}
                      bot={b}
                      selected={selectedUid === b.uid}
                      onClick={() => applyMu.mutate(b)}
                    />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>

      <ChatMain />
    </div>
  );
}
