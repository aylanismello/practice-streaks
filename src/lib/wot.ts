export const WOT_LEVELS = ["green", "yellow", "orange", "red", "deep_red"] as const;
export type WotLevel = (typeof WOT_LEVELS)[number];

export const WOT_LEVEL_ALIASES: Record<string, WotLevel> = {
  green: "green",
  yellow: "yellow",
  orange: "orange",
  amber: "orange",
  red: "red",
  deep_red: "deep_red",
  maroon: "deep_red",
  crimson: "deep_red",
};

export function normalizeWotLevel(input: unknown): WotLevel | null {
  if (typeof input !== "string") return null;
  return WOT_LEVEL_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function wotEmoji(level: WotLevel): string {
  switch (level) {
    case "green": return "🟢";
    case "yellow": return "🟡";
    case "orange": return "🟠";
    case "red": return "🔴";
    case "deep_red": return "🟥";
  }
}

export function wotCssColor(level: WotLevel): string {
  switch (level) {
    case "green": return "#4ade80";
    case "yellow": return "#fbbf24";
    case "orange": return "#fb923c";
    case "red": return "#f87171";
    case "deep_red": return "#ef4444";
  }
}

export function mapLegacyWotLevel(level: string): WotLevel {
  if (level === "red") return "deep_red";
  if (level === "yellow") return "orange";
  if (level === "green") return "green";
  return normalizeWotLevel(level) ?? "orange";
}
