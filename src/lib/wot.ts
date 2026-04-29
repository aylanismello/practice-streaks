export const WOT_SCORES = [1, 2, 3, 4, 5] as const;
export type WotScore = (typeof WOT_SCORES)[number];

export const WOT_LEVELS = ["green", "yellow_green", "yellow", "orange", "red"] as const;
export type WotLevel = (typeof WOT_LEVELS)[number];

export const WOT_SCORE_TO_LEVEL: Record<WotScore, WotLevel> = {
  1: "red",
  2: "orange",
  3: "yellow",
  4: "yellow_green",
  5: "green",
};

export const WOT_LEVEL_TO_SCORE: Record<WotLevel, WotScore> = {
  red: 1,
  orange: 2,
  yellow: 3,
  yellow_green: 4,
  green: 5,
};

export const WOT_LEVEL_ALIASES: Record<string, WotLevel> = {
  green: "green",
  "yellow-green": "yellow_green",
  "4/5": "yellow_green",
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

export function normalizeWotScore(input: unknown): WotScore | null {
  if (typeof input === "number" && Number.isInteger(input) && WOT_SCORES.includes(input as WotScore)) {
    return input as WotScore;
  }
  if (typeof input !== "string") return null;

  const trimmed = input.trim().toLowerCase();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && WOT_SCORES.includes(numeric as WotScore)) {
    return numeric as WotScore;
  }

  const level = normalizeWotLevel(trimmed);
  return level ? WOT_LEVEL_TO_SCORE[level] : null;
}

export function wotEmoji(level: WotLevel): string {
  switch (level) {
    case "green": return "🟢";
    case "yellow_green": return "🟩";
    case "yellow": return "🟨";
    case "orange": return "🟠";
    case "red": return "🔴";
  }
}

export function wotCssColor(level: WotLevel): string {
  switch (level) {
    case "green": return "#4ade80";
    case "yellow_green": return "#84cc16";
    case "yellow": return "#fbbf24";
    case "orange": return "#fb923c";
    case "red": return "#ef4444";
  }
}

export function formatWotLabel(level: WotLevel): string {
  switch (level) {
    case "green": return "5/5 green";
    case "yellow_green": return "4/5 yellow-green";
    case "yellow": return "3/5 yellow";
    case "orange": return "2/5 orange";
    case "red": return "1/5 red";
  }
}

export function mapLegacyWotLevel(level: string): WotLevel {
  return normalizeWotLevel(level) ?? "yellow";
}

export function effectiveWotLevel(row: { color: string; legacy_color?: string | null }): WotLevel {
  const score = effectiveWotScore(row);
  return WOT_SCORE_TO_LEVEL[score];
}

export function effectiveWotScore(row: { score?: number | string | null; color?: string | null; legacy_color?: string | null }): WotScore {
  return normalizeWotScore(row.score) ?? normalizeWotScore(row.color) ?? normalizeWotScore(row.legacy_color) ?? 3;
}
