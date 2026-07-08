import { useEffect, useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import WKSDK, { Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Search as SearchIcon,
  Users,
  UsersRound,
} from "lucide-react";
import { spaceStore } from "@/features/base/stores/space";
import { authStore } from "@/features/base/stores/auth";
import { bucketLetter, sortLetters } from "@/features/base/lib/pinyin-bucket";
import { VirtualizedLetterList } from "@/components/data/virtualized-letter-list";
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { ConversationOnlineBadge } from "@/features/chat/components/conversation-online-badge";
import { useChannelInfoTick } from "@/features/chat/hooks/use-channel-info-tick.hook";
import { shouldShowConversationOnline } from "@/features/chat/lib/conversation-online";
import { tryFetchChannelInfo } from "@/features/chat/lib/live-channel-title";
import { AiBadge } from "@/features/base/components/badges/ai-badge";
import { UserInfoModal } from "@/features/base/components/modals/user-info-modal";
import { GroupCardModal } from "@/features/base/components/modals/group-card-modal";
import { BotDetailModal } from "@/features/base/components/modals/bot-detail-modal";
import type { SpaceMember } from "@/features/base/api/endpoints/space.api";
import type { RobotBot } from "@/features/base/api/endpoints/robot.api";
import type { GroupSummary } from "@/features/base/api/endpoints/group.api";
import {
  myBotsQueryOptions,
  myGroupsQueryOptions,
  spaceBotsQueryOptions,
  spaceMembersQueryOptions,
} from "@/features/contacts/queries/directory.query";
import { useT } from "@/lib/i18n/use-t";

type FilterMode = "all" | "bots" | "humans";
type SectionId = "groups" | "myBots" | "allContacts";

/** 联系人列表超过这个阈值,allContacts 段切到虚拟列表(对齐旧 dmworkcontacts 100)。 */
const VIRTUAL_THRESHOLD = 100;
const EMPTY_MEMBERS: SpaceMember[] = [];
const EMPTY_BOTS: RobotBot[] = [];
const EMPTY_GROUPS: GroupSummary[] = [];

function normalizeOnlineUid(uid: string, spaceId: string | null): string {
  if (spaceId && uid.startsWith(`s${spaceId}_`)) {
    return uid.substring(spaceId.length + 2);
  }
  return uid;
}

function useFetchContactOnlineInfo(channel: Channel, enabled: boolean, hasInfo: boolean) {
  useEffect(() => {
    if (!enabled || hasInfo) return;
    tryFetchChannelInfo(channel);
  }, [channel, enabled, hasInfo]);
}

function ContactAvatar({
  item,
  spaceId,
}: {
  item: Pick<ContactItem, "uid" | "name" | "isBot">;
  spaceId: string | null;
}) {
  const avatarChannel = useMemo(() => new Channel(item.uid, ChannelTypePerson), [item.uid]);
  const onlineChannel = useMemo(
    () => new Channel(normalizeOnlineUid(item.uid, spaceId), ChannelTypePerson),
    [item.uid, spaceId],
  );
  useChannelInfoTick();
  const onlineInfo = WKSDK.shared().channelManager.getChannelInfo(onlineChannel);
  useFetchContactOnlineInfo(onlineChannel, item.isBot, !!onlineInfo);
  const showOnline = item.isBot && shouldShowConversationOnline(onlineInfo);

  return (
    <span className="relative h-8 w-8 shrink-0">
      <ChannelAvatar channel={avatarChannel} size={32} title={item.name} />
      {showOnline ? <ConversationOnlineBadge info={onlineInfo} /> : null}
    </span>
  );
}

/**
 * 联合 contact 项(人/AI 在主列表里同形渲染),
 * 字段是 spaceMember / spaceBot 字段的最小公共集 + role/bot 元信息。
 */
interface ContactItem {
  uid: string;
  name: string;
  avatar?: string;
  isBot: boolean;
  role?: number; // 1: owner, 2: admin, 3: member;只 humans/spaceMember 有
}

/** 组合 spaceMembers + spaceBots(去自己 / 按 filter 派生)。 */
function buildContacts(
  members: SpaceMember[],
  bots: RobotBot[],
  myUid: string,
  filter: FilterMode,
): ContactItem[] {
  if (filter === "bots") {
    return bots
      .filter((b) => b.uid !== myUid)
      .map<ContactItem>((b) => ({
        uid: b.uid,
        name: b.name || b.uid,
        avatar: b.avatar,
        isBot: true,
      }));
  }
  if (filter === "humans") {
    return members
      .filter((m) => m.uid !== myUid && m.robot !== 1)
      .map<ContactItem>((m) => ({
        uid: m.uid,
        name: m.name,
        avatar: m.avatar,
        isBot: false,
        role: m.role,
      }));
  }
  // "全部":members 去自己 + spaceBots 中不在 members 的 AI
  const memberUids = new Set(members.map((m) => m.uid));
  const memberItems = members
    .filter((m) => m.uid !== myUid)
    .map<ContactItem>((m) => ({
      uid: m.uid,
      name: m.name,
      avatar: m.avatar,
      isBot: m.robot === 1,
      role: m.role,
    }));
  const extraBots = bots
    .filter((b) => b.uid !== myUid && !memberUids.has(b.uid))
    .map<ContactItem>((b) => ({
      uid: b.uid,
      name: b.name || b.uid,
      avatar: b.avatar,
      isBot: true,
    }));
  return [...memberItems, ...extraBots];
}

function indexByLetter(items: ContactItem[]): { letter: string; items: ContactItem[] }[] {
  const map = new Map<string, ContactItem[]>();
  for (const item of items) {
    const key = bucketLetter(item.name);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return [...map.keys()].sort(sortLetters).map((letter) => ({
    letter,
    items: map
      .get(letter)!
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

/**
 * 群 tag(对齐旧 .wk-contacts-group-tag):灰底 #E2E3EA + 次要文本色,
 * font-medium 500,10px,padding 1px 6px。
 */
function GroupTag() {
  const t = useT();
  return (
    <span className="inline-flex shrink-0 items-center rounded-sm bg-bg-elevated px-1.5 text-[10px] leading-4 font-medium text-text-secondary">
      {t("contacts.directory.groupTag")}
    </span>
  );
}

function ContactRow({
  item,
  spaceId,
  onClick,
}: {
  item: ContactItem;
  spaceId: string | null;
  onClick: () => void;
}) {
  const t = useT();
  const roleLabel =
    item.role === 1
      ? t("contacts.directory.roleOwner")
      : item.role === 2
        ? t("contacts.directory.roleAdmin")
        : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) hover:bg-bg-hover"
    >
      <ContactAvatar item={item} spaceId={spaceId} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-text-primary">{item.name}</span>
        {item.isBot ? <AiBadge /> : null}
      </div>
      {roleLabel ? (
        <span
          className={`shrink-0 rounded-sm px-1.5 text-[10px] font-semibold ${
            item.role === 1 ? "bg-brand/10 text-brand" : "bg-bg-elevated text-text-secondary"
          }`}
        >
          {roleLabel}
        </span>
      ) : null}
    </button>
  );
}

function GroupRow({ group, onClick }: { group: GroupSummary; onClick: () => void }) {
  const channel = useMemo(() => new Channel(group.group_no, ChannelTypeGroup), [group.group_no]);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={32} title={group.name} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-text-primary">{group.name}</span>
        <GroupTag />
      </div>
    </button>
  );
}

function AccordionHeader({
  icon,
  label,
  count,
  expanded,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-bg-hover"
    >
      <span className="shrink-0 text-text-tertiary">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </span>
      <span className="shrink-0 text-text-secondary">{icon}</span>
      <span className="flex-1 text-sm font-medium text-text-primary">{label}</span>
      {count > 0 ? <span className="text-xs text-text-tertiary">({count})</span> : null}
    </button>
  );
}

function FilterChips({
  value,
  onChange,
  counts,
}: {
  value: FilterMode;
  onChange: (m: FilterMode) => void;
  counts: { all: number; bots: number; humans: number };
}) {
  const t = useT();
  const chips: { id: FilterMode; label: string; count: number }[] = [
    { id: "all", label: t("contacts.directory.filterAll"), count: counts.all },
    { id: "bots", label: t("contacts.directory.filterAi"), count: counts.bots },
    { id: "humans", label: t("contacts.directory.filterHumans"), count: counts.humans },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-4 py-2">
      {chips.map((c) => {
        const active = value === c.id;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-[13px] leading-none font-medium transition-colors ${
              active
                ? "border-brand/20 bg-brand/8 text-brand"
                : "border-border-default bg-transparent text-text-secondary hover:bg-bg-hover"
            }`}
          >
            <span>{c.label}</span>
            {c.count > 0 ? (
              <span
                className={`text-[11px] font-semibold ${
                  active ? "text-brand" : "text-text-tertiary"
                }`}
              >
                {c.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-6 text-text-tertiary">
      <span>{icon}</span>
      <span className="text-xs">{text}</span>
    </div>
  );
}

/**
 * 通讯录主目录(对应旧 .wk-contacts-content):
 *   ┌ BotFather banner (外层 view 渲染)
 *   ├ 搜索框
 *   ├ 搜索结果 OR
 *   └ 手风琴 3 段
 *       - 群聊                         → GroupCardModal
 *       - 已添加 AI                    → BotDetailModal
 *       - 全部联系人(filter / 字母索引)→ 人 → UserInfoModal / AI → BotDetailModal
 *
 * **全部联系人段虚拟化**(对齐旧 VirtualContactList):items > 100 启用
 * VirtualizedLetterList(useVirtualizer 按估高 44px 行 + 24px header 渲染);
 * <= 100 用普通 map 避免无谓开销 + 保 sticky letter header 视觉。
 */
export function ContactsDirectory() {
  const t = useT();
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");

  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<SectionId | null>("allContacts");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [userInfoUid, setUserInfoUid] = useState<string | null>(null);
  const [botDetailUid, setBotDetailUid] = useState<string | null>(null);
  const [groupCardNo, setGroupCardNo] = useState<string | null>(null);
  const [groupCardFallback, setGroupCardFallback] = useState<{
    name?: string;
    memberCount?: number;
  }>({});

  const membersQ = useQuery(spaceMembersQueryOptions(currentSpaceId));
  const myBotsQ = useQuery(myBotsQueryOptions(currentSpaceId));
  const spaceBotsQ = useQuery(spaceBotsQueryOptions(currentSpaceId));
  const myGroupsQ = useQuery(myGroupsQueryOptions(currentSpaceId));

  const members = membersQ.data ?? EMPTY_MEMBERS;
  const myBots = myBotsQ.data ?? EMPTY_BOTS;
  const spaceBots = spaceBotsQ.data ?? EMPTY_BOTS;
  const myGroups = myGroupsQ.data ?? EMPTY_GROUPS;

  const contacts = useMemo(
    () => buildContacts(members, spaceBots, myUid, filter),
    [members, spaceBots, myUid, filter],
  );
  const grouped = useMemo(() => indexByLetter(contacts), [contacts]);

  const filterCounts = useMemo(() => {
    const memberUids = new Set(members.map((m) => m.uid));
    const humans = members.filter((m) => m.uid !== myUid && m.robot !== 1).length;
    const bots = spaceBots.filter((b) => b.uid !== myUid).length;
    const all =
      members.filter((m) => m.uid !== myUid).length +
      spaceBots.filter((b) => b.uid !== myUid && !memberUids.has(b.uid)).length;
    return { all, bots, humans };
  }, [members, spaceBots, myUid]);

  const kw = keyword.trim().toLowerCase();
  const searching = kw.length > 0;
  const searchContacts = useMemo(() => {
    if (!searching) return [];
    return contacts.filter((c) => c.name.toLowerCase().includes(kw));
  }, [contacts, kw, searching]);
  const searchGroups = useMemo(() => {
    if (!searching) return [];
    return myGroups.filter((g) => (g.name ?? "").toLowerCase().includes(kw));
  }, [myGroups, kw, searching]);

  const handleContactClick = (item: { uid: string; isBot: boolean }) => {
    if (item.isBot) setBotDetailUid(item.uid);
    else setUserInfoUid(item.uid);
  };
  const handleGroupClick = (group: GroupSummary) => {
    setGroupCardFallback({ name: group.name, memberCount: group.member_count });
    setGroupCardNo(group.group_no);
  };

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        {t("contacts.directory.needSpace")}
      </div>
    );
  }

  const toggle = (id: SectionId) => setExpanded((prev) => (prev === id ? null : id));
  const useVirtual = contacts.length > VIRTUAL_THRESHOLD;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border-[1.5px] border-transparent bg-bg-elevated px-3 py-1.5 focus-within:border-brand">
          <SearchIcon size={14} className="shrink-0 text-text-tertiary" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("contacts.directory.searchPlaceholder")}
            className="flex-1 border-0 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword("")}
              aria-label={t("contacts.directory.clearSearch")}
              className="shrink-0 px-0.5 text-base leading-none text-text-tertiary hover:text-text-secondary"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {searching ? (
          searchContacts.length === 0 && searchGroups.length === 0 ? (
            <EmptyHint icon={<SearchIcon size={24} />} text={t("contacts.directory.noResults")} />
          ) : (
            <div className="flex min-h-0 flex-col overflow-y-auto pb-3">
              {searchContacts.length > 0 ? (
                <section className="flex flex-col">
                  <header className="px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                    {t("contacts.directory.contactsHeader")}
                  </header>
                  {searchContacts.map((c) => (
                    <ContactRow
                      key={c.uid}
                      item={c}
                      spaceId={currentSpaceId}
                      onClick={() => handleContactClick(c)}
                    />
                  ))}
                </section>
              ) : null}
              {searchGroups.length > 0 ? (
                <section className="flex flex-col">
                  <header className="px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                    {t("contacts.directory.groupsHeader")}
                  </header>
                  {searchGroups.map((g) => (
                    <GroupRow key={g.group_no} group={g} onClick={() => handleGroupClick(g)} />
                  ))}
                </section>
              ) : null}
            </div>
          )
        ) : (
          <>
            <section
              className={`flex flex-col border-b border-border-subtle ${
                expanded === "groups" ? "min-h-0" : "shrink-0"
              }`}
            >
              <AccordionHeader
                icon={<UsersRound size={16} />}
                label={t("contacts.directory.sectionGroups")}
                count={myGroups.length}
                expanded={expanded === "groups"}
                onToggle={() => toggle("groups")}
              />
              {expanded === "groups" ? (
                myGroups.length === 0 ? (
                  <EmptyHint
                    icon={<UsersRound size={24} />}
                    text={t("contacts.directory.emptyGroups")}
                  />
                ) : (
                  <div className="flex min-h-0 flex-col overflow-y-auto pb-2">
                    {myGroups.map((g) => (
                      <GroupRow key={g.group_no} group={g} onClick={() => handleGroupClick(g)} />
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section
              className={`flex flex-col border-b border-border-subtle ${
                expanded === "myBots" ? "min-h-0" : "shrink-0"
              }`}
            >
              <AccordionHeader
                icon={<Bot size={16} />}
                label={t("contacts.directory.sectionMyBots")}
                count={myBots.length}
                expanded={expanded === "myBots"}
                onToggle={() => toggle("myBots")}
              />
              {expanded === "myBots" ? (
                myBots.length === 0 ? (
                  <EmptyHint icon={<Bot size={24} />} text={t("contacts.directory.emptyMyBots")} />
                ) : (
                  <div className="flex min-h-0 flex-col overflow-y-auto pb-2">
                    {myBots.map((b) => (
                      <ContactRow
                        key={b.uid}
                        item={{ uid: b.uid, name: b.name || b.uid, avatar: b.avatar, isBot: true }}
                        spaceId={currentSpaceId}
                        onClick={() => handleContactClick({ uid: b.uid, isBot: true })}
                      />
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section
              className={`flex flex-col ${
                expanded === "allContacts"
                  ? useVirtual
                    ? "min-h-0 flex-1"
                    : "min-h-0"
                  : "shrink-0"
              }`}
            >
              <AccordionHeader
                icon={<Users size={16} />}
                label={t("contacts.directory.sectionAllContacts")}
                count={contacts.length}
                expanded={expanded === "allContacts"}
                onToggle={() => toggle("allContacts")}
              />
              {expanded === "allContacts" ? (
                <>
                  <FilterChips value={filter} onChange={setFilter} counts={filterCounts} />
                  {contacts.length === 0 ? (
                    <EmptyHint
                      icon={<Users size={24} />}
                      text={t("contacts.directory.emptyAllContacts")}
                    />
                  ) : useVirtual ? (
                    <div className="flex min-h-0 flex-1">
                      <VirtualizedLetterList
                        groups={grouped}
                        renderRow={(item) => (
                          <ContactRow
                            item={item}
                            spaceId={currentSpaceId}
                            onClick={() => handleContactClick(item)}
                          />
                        )}
                        rowHeight={44}
                        headerHeight={24}
                        className="h-full w-full"
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-col overflow-y-auto pb-2">
                      {grouped.map(({ letter, items }) => (
                        <div key={letter} className="flex flex-col">
                          <header className="sticky top-0 bg-bg-base px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                            {letter}
                          </header>
                          {items.map((item) => (
                            <ContactRow
                              key={item.uid}
                              item={item}
                              spaceId={currentSpaceId}
                              onClick={() => handleContactClick(item)}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </section>
          </>
        )}
      </div>

      <UserInfoModal uid={userInfoUid} onClose={() => setUserInfoUid(null)} />
      <BotDetailModal uid={botDetailUid} onClose={() => setBotDetailUid(null)} />
      <GroupCardModal
        groupNo={groupCardNo}
        fallbackName={groupCardFallback.name}
        fallbackMemberCount={groupCardFallback.memberCount}
        onClose={() => setGroupCardNo(null)}
      />
    </div>
  );
}
