export const GROUP_AVATAR_COLORS = [
  { main: "#7C3AED", fill: "#F1EAFF", iconBack: "#C4B5FD" },
  { main: "#2563EB", fill: "#EAF2FF", iconBack: "#93C5FD" },
  { main: "#059669", fill: "#E7F8F0", iconBack: "#86EFAC" },
  { main: "#DC2626", fill: "#FEECEC", iconBack: "#FCA5A5" },
  { main: "#D97706", fill: "#FFF4E0", iconBack: "#FCD34D" },
  { main: "#0891B2", fill: "#E6F8FC", iconBack: "#67E8F9" },
] as const;

export function cleanGroupAvatarText(value: string): string {
  return Array.from(value.trim()).slice(0, 4).join("");
}

export function groupAvatarFallbackText(name: string): string {
  return Array.from(name.trim()).slice(0, 2).join("");
}

export function groupAvatarLines(text: string): string[] {
  const chars = Array.from(cleanGroupAvatarText(text));
  if (chars.length <= 2) return [chars.join("")];
  return [chars.slice(0, 2).join(""), chars.slice(2, 4).join("")];
}

export function colorIndexForName(name: string, total = GROUP_AVATAR_COLORS.length): number {
  const chars = Array.from(name || "group");
  const sum = chars.reduce((acc, ch) => acc + ch.codePointAt(0)!, 0);
  return Math.abs(sum) % Math.max(1, total);
}
