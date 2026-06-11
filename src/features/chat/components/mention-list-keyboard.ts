export type MentionListKeyAction = "none" | "previous" | "next" | "select";

export function resolveMentionListKeyAction(key: string, itemCount: number): MentionListKeyAction {
  if (itemCount <= 0) return "none";
  if (key === "ArrowUp") return "previous";
  if (key === "ArrowDown") return "next";
  if (key === "Enter" || key === "Tab") return "select";
  return "none";
}
