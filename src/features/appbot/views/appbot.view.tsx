import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import WKSDK, { Channel, ChannelInfo, ChannelTypePerson } from "wukongimjssdk";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { message } from "@/components/ui/message";
import { useT } from "@/lib/i18n/use-t";
import { spaceStore } from "@/features/base/stores/space";
import { mySpacesQueryOptions } from "@/features/base/queries/spaces.query";
import { useResetOnSpaceChange } from "@/features/base/hooks/use-reset-on-space-change.hook";
import { chatSelectedActions, chatSelectedStore } from "@/features/chat/stores/chat-selected";
import { ChatMain } from "@/features/chat/components/chat-main";
import { ChatEmptyHologram } from "@/features/chat/components/chat-empty-hologram";
import { applyBot } from "@/features/appbot/api/app-bot.api";
import { appBotsQueryOptions } from "@/features/appbot/queries/app-bots.query";
import { BotRow } from "@/features/appbot/components/bot-row";
import type { AppBotInfo } from "@/features/appbot/types/app-bot.types";

const EMPTY_APP_BOTS: AppBotInfo[] = [];

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
function useIsolateAppbotChatSelection(): void {
  useEffect(() => {
    chatSelectedActions.clear();
    return () => {
      chatSelectedActions.clear();
    };
  }, []);
}

export function AppbotView() {
  const t = useT();
  const spaceId = useStore(spaceStore, (s) => s.spaceId);
  const selectedChannel = useStore(chatSelectedStore, (s) => s.channel);
  const [keyword, setKeyword] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const selectingRef = useRef(false);

  useIsolateAppbotChatSelection();

  useResetOnSpaceChange(() => {
    setSelectedUid(null);
    setKeyword("");
  });

  const { data, isFetching, isLoading, error, refetch } = useQuery(appBotsQueryOptions(spaceId));
  const { data: spaces } = useQuery({
    ...mySpacesQueryOptions(),
    enabled: !!spaceId,
  });

  const bots = data ?? EMPTY_APP_BOTS;
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
  const spaceName = useMemo(
    () => (spaceId ? ((spaces ?? []).find((s) => s.space_id === spaceId)?.name ?? "") : ""),
    [spaceId, spaces],
  );
  const activeSelectedUid =
    selectedUid &&
    selectedChannel?.channelType === ChannelTypePerson &&
    selectedChannel.channelID === selectedUid
      ? selectedUid
      : null;

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
      message.error(err instanceof Error ? err.message : t("appbot.error.connectFailed")),
    onSettled: () => {
      selectingRef.current = false;
    },
  });

  const handleBotClick = (bot: AppBotInfo) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    applyMu.mutate(bot);
  };

  const handleRetry = () => {
    void refetch();
  };

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
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("appbot.page.searchPlaceholder")}
              className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {isLoading || (isFetching && bots.length === 0) ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-text-tertiary">
              <RefreshCw size={18} className="animate-spin" />
              {t("appbot.state.loading")}
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-text-tertiary">
              <span className="text-error">{t("appbot.state.loadFailed")}</span>
              <Button variant="outline" size="sm" onClick={handleRetry} disabled={isFetching}>
                <RefreshCw className={isFetching ? "animate-spin" : ""} />
                {t("appbot.action.retry")}
              </Button>
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
                      selected={activeSelectedUid === b.uid}
                      onClick={() => handleBotClick(b)}
                    />
                  ))}
                </section>
              ) : null}
              {spaceBots.length > 0 ? (
                <section className="flex flex-col gap-0.5">
                  <header className="px-3 py-1 text-[11px] font-semibold text-text-tertiary">
                    {spaceName
                      ? t("appbot.section.spaceWithName", { values: { name: spaceName } })
                      : t("appbot.section.space")}
                  </header>
                  {spaceBots.map((b) => (
                    <BotRow
                      key={b.id}
                      bot={b}
                      selected={activeSelectedUid === b.uid}
                      onClick={() => handleBotClick(b)}
                    />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </aside>

      {activeSelectedUid ? <ChatMain /> : <ChatEmptyHologram />}
    </div>
  );
}
