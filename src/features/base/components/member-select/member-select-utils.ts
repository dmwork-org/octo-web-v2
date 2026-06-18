interface MemberLike {
  uid: string;
  name?: string;
}

export function filterMembersByKeyword<T extends MemberLike>(members: T[], keyword: string): T[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return members;
  return members.filter(
    (member) =>
      (member.name || "").toLowerCase().includes(kw) || member.uid.toLowerCase().includes(kw),
  );
}

export function toggleMemberSelection(
  setSelected: (updater: (prev: Set<string>) => Set<string>) => void,
  uid: string,
) {
  setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    return next;
  });
}
