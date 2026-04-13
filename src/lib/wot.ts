export const WOT_LEVELS = ["green", "yellow_green", "yellow", "orange", "red"] as const;
export type WotLevel = (typeof WOT_LEVELS)[number];

export const WOT_LEVEL_ALIASES: Record<string, WotLevel> = {
  green: "green",
  "yellow-green": "yellow_green",
  yellow_green: "yellow_green",
  solid: "yellow_green",
  yellow: "yellow",
  medium: "yellow",
  orange: "orange",
  amber: "orange",
  tight: "orange",
  red: "red",
  deep_red: "red",
  maroon: "red",
  crimson: "red",
};

export function normalizeWotLevel(input: unknown): WotLevel | null {
  if (typeof input !== "string") return null;
  return WOT_LEVEL_ALIASES[input.trim().toLowerCase()] ?? null;
}

export function wotEmoji(level: WotLevel): string {
  switch (level) {
    case "green": return "🟢";
    case "yellow_green": return "🟡";
    case "yellow": return "🟨";
    case "orange": return "🟠";
    case "red": return "🔴";
  }
}

export function wotCssColor(level: WotLevel): string {
  switch (level) {
    case "green": return "#4ade80";
    case "yellow_green": return "#a3e635";
    case "yellow": return "#fbbf24";
    case "orange": return "#fb923c";
    case "red": return "#ef4444";
  }
}

export function mapLegacyWotLevel(level: string): WotLevel {
  return normalizeWotLevel(level) ?? "yellow";
}

export function effectiveWotLevel(row: { color: string; legacy_color?: string | null }): WotLevel {
  return normalizeWotLevel(row.legacy_color ?? row.color) ?? mapLegacyWotLevel(row.color);
}
