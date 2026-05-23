import { useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useQuery } from "@tanstack/react-query";
import { Channel, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
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
import { ChannelAvatar } from "@/features/chat/components/channel-avatar";
import { chatSelectedActions } from "@/features/chat/stores/chat-selected";
import type { SpaceMember } from "@/features/base/api/endpoints/space.api";
import type { RobotBot } from "@/features/base/api/endpoints/robot.api";
import type { GroupSummary } from "@/features/base/api/endpoints/group.api";
import {
  myBotsQueryOptions,
  myGroupsQueryOptions,
  spaceBotsQueryOptions,
  spaceMembersQueryOptions,
} from "@/features/contacts/queries/directory.query";

type FilterMode = "all" | "bots" | "humans";
type SectionId = "groups" | "myBots" | "allContacts";

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

const ROLE_LABELS: Record<number, string> = { 1: "创建者", 2: "管理员" };

/** 中文/数字一律归 #;英文按首字母分。简化版,P3 后续接 pinyin 库。 */
function bucketLetter(name: string): string {
  if (!name) return "#";
  const ch = name.charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(ch)) return ch;
  return "#";
}

function sortLetters(a: string, b: string): number {
  if (a === "#") return 1;
  if (b === "#") return -1;
  return a.localeCompare(b);
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

function ContactRow({ item }: { item: ContactItem }) {
  const channel = useMemo(() => new Channel(item.uid, ChannelTypePerson), [item.uid]);
  const onClick = () => chatSelectedActions.select(channel);
  const roleLabel = item.role && item.role > 0 && item.role <= 2 ? ROLE_LABELS[item.role] : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={32} title={item.name} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-text-primary">{item.name}</span>
        {item.isBot ? (
          <span className="shrink-0 rounded-sm bg-accent/10 px-1.5 text-[10px] font-semibold text-accent">
            AI
          </span>
        ) : null}
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

function GroupRow({ group }: { group: GroupSummary }) {
  const channel = useMemo(() => new Channel(group.group_no, ChannelTypeGroup), [group.group_no]);
  const onClick = () => chatSelectedActions.select(channel);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-left transition-colors duration-150 ease-(--ease-emphasized) hover:bg-bg-hover"
    >
      <ChannelAvatar channel={channel} size={32} title={group.name} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm text-text-primary">{group.name}</span>
        <span className="shrink-0 rounded-sm bg-bg-elevated px-1.5 text-[10px] font-semibold text-text-secondary">
          群
        </span>
      </div>
      {typeof group.member_count === "number" ? (
        <span className="shrink-0 text-[11px] text-text-tertiary">{group.member_count}</span>
      ) : null}
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
  const chips: { id: FilterMode; label: string; count: number }[] = [
    { id: "all", label: "全部", count: counts.all },
    { id: "bots", label: "AI", count: counts.bots },
    { id: "humans", label: "人类", count: counts.humans },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-4 py-2">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
            value === c.id
              ? "bg-brand text-white"
              : "bg-bg-elevated text-text-secondary hover:bg-bg-hover"
          }`}
        >
          <span>{c.label}</span>
          {c.count > 0 ? (
            <span className={value === c.id ? "text-white/80" : "text-text-tertiary"}>
              {c.count}
            </span>
          ) : null}
        </button>
      ))}
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
 *       - 群聊
 *       - 已添加 AI
 *       - 全部联系人(含 filter chips + 字母索引)
 *
 * 4 个 query 都按 spaceId 维度;currentSpaceId 为空时显示"先选择一个 Space"占位。
 */
export function ContactsDirectory() {
  const currentSpaceId = useStore(spaceStore, (s) => s.spaceId);
  const myUid = useStore(authStore, (s) => s.user?.uid ?? "");

  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<SectionId | null>("allContacts");
  const [filter, setFilter] = useState<FilterMode>("all");

  const membersQ = useQuery(spaceMembersQueryOptions(currentSpaceId));
  const myBotsQ = useQuery(myBotsQueryOptions(currentSpaceId));
  const spaceBotsQ = useQuery(spaceBotsQueryOptions(currentSpaceId));
  const myGroupsQ = useQuery(myGroupsQueryOptions(currentSpaceId));

  const members = membersQ.data ?? [];
  const myBots = myBotsQ.data ?? [];
  const spaceBots = spaceBotsQ.data ?? [];
  const myGroups = myGroupsQ.data ?? [];

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

  if (!currentSpaceId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-text-tertiary">
        先在顶部切换到一个 Space,才能加载通讯录
      </div>
    );
  }

  const toggle = (id: SectionId) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 focus-within:border-brand">
          <SearchIcon size={14} className="text-text-tertiary" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索通讯录"
            className="flex-1 border-0 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => setKeyword("")}
              aria-label="清空搜索"
              className="text-text-tertiary hover:text-text-primary"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto pb-3">
        {searching ? (
          searchContacts.length === 0 && searchGroups.length === 0 ? (
            <EmptyHint icon={<SearchIcon size={24} />} text="没有找到相关联系人" />
          ) : (
            <>
              {searchContacts.length > 0 ? (
                <section className="flex flex-col">
                  <header className="px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                    联系人
                  </header>
                  {searchContacts.map((c) => (
                    <ContactRow key={c.uid} item={c} />
                  ))}
                </section>
              ) : null}
              {searchGroups.length > 0 ? (
                <section className="flex flex-col">
                  <header className="px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                    群聊
                  </header>
                  {searchGroups.map((g) => (
                    <GroupRow key={g.group_no} group={g} />
                  ))}
                </section>
              ) : null}
            </>
          )
        ) : (
          <>
            <section className="flex flex-col border-b border-border-subtle">
              <AccordionHeader
                icon={<UsersRound size={16} />}
                label="群聊"
                count={myGroups.length}
                expanded={expanded === "groups"}
                onToggle={() => toggle("groups")}
              />
              {expanded === "groups" ? (
                myGroups.length === 0 ? (
                  <EmptyHint icon={<UsersRound size={24} />} text="还没有群聊,去创建一个吧" />
                ) : (
                  <div className="flex flex-col pb-2">
                    {myGroups.map((g) => (
                      <GroupRow key={g.group_no} group={g} />
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section className="flex flex-col border-b border-border-subtle">
              <AccordionHeader
                icon={<Bot size={16} />}
                label="已添加 AI"
                count={myBots.length}
                expanded={expanded === "myBots"}
                onToggle={() => toggle("myBots")}
              />
              {expanded === "myBots" ? (
                myBots.length === 0 ? (
                  <EmptyHint icon={<Bot size={24} />} text="还没有添加 AI,去全部联系人里看看" />
                ) : (
                  <div className="flex flex-col pb-2">
                    {myBots.map((b) => (
                      <ContactRow
                        key={b.uid}
                        item={{ uid: b.uid, name: b.name || b.uid, avatar: b.avatar, isBot: true }}
                      />
                    ))}
                  </div>
                )
              ) : null}
            </section>

            <section className="flex flex-col">
              <AccordionHeader
                icon={<Users size={16} />}
                label="全部联系人"
                count={contacts.length}
                expanded={expanded === "allContacts"}
                onToggle={() => toggle("allContacts")}
              />
              {expanded === "allContacts" ? (
                <>
                  <FilterChips value={filter} onChange={setFilter} counts={filterCounts} />
                  {contacts.length === 0 ? (
                    <EmptyHint icon={<Users size={24} />} text="当前 Space 还没有成员" />
                  ) : (
                    <div className="flex flex-col pb-2">
                      {grouped.map(({ letter, items }) => (
                        <div key={letter} className="flex flex-col">
                          <header className="sticky top-0 bg-bg-base px-4 py-1 text-[11px] font-semibold text-text-tertiary">
                            {letter}
                          </header>
                          {items.map((item) => (
                            <ContactRow key={item.uid} item={item} />
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
    </div>
  );
}
