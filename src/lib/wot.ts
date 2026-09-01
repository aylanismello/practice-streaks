export const WOT_SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
export type WotScore = (typeof WOT_SCORES)[number];

export const WOT_LEVELS = ["green", "yellow_green", "yellow", "orange", "red"] as const;
export type WotLevel = (typeof WOT_LEVELS)[number];

export const WOT_SCORE_TO_LEVEL: Record<WotScore, WotLevel> = {
  1: "red",
  1.5: "red",
  2: "orange",
  2.5: "orange",
  3: "yellow",
  3.5: "yellow",
  4: "yellow_green",
  4.5: "yellow_green",
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
  if (typeof input === "number" && WOT_SCORES.includes(input as WotScore)) {
    return input as WotScore;
  }
  if (typeof input !== "string") return null;

  const trimmed = input.trim().toLowerCase();
  const numeric = Number(trimmed);
  if (WOT_SCORES.includes(numeric as WotScore)) {
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

const WOT_SCORE_COLORS: Record<WotScore, string> = {
  1: "#ef4444",
  1.5: "#f56b40",
  2: "#fb923c",
  2.5: "#fbaa30",
  3: "#fbbf24",
  3.5: "#c2c81d",
  4: "#84cc16",
  4.5: "#67d34b",
  5: "#4ade80",
};

export function wotScoreCssColor(score: WotScore): string {
  return WOT_SCORE_COLORS[score];
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

export function formatWotScoreLabel(score: WotScore): string {
  return `${score}/5`;
}

export function mapLegacyWotLevel(level: string): WotLevel {
  return normalizeWotLevel(level) ?? "yellow";
}

export function effectiveWotLevel(row: { score?: number | string | null; color: string; legacy_color?: string | null }): WotLevel {
  const score = effectiveWotScore(row);
  return WOT_SCORE_TO_LEVEL[score];
}

export function effectiveWotScore(row: { score?: number | string | null; color?: string | null; legacy_color?: string | null }): WotScore {
  // Half-step values use the unconstrained legacy field while production still
  // has an integer score column. Named legacy colors remain lower priority.
  const bridgedScore = normalizeWotScore(row.legacy_color);
  if (bridgedScore != null && !Number.isInteger(bridgedScore)) return bridgedScore;
  return normalizeWotScore(row.score) ?? normalizeWotScore(row.color) ?? bridgedScore ?? 3;
}

export function wotStorageFields(score: WotScore): {
  score: number;
  color: WotLevel;
  legacy_color: string | null;
} {
  const storedScore = Number.isInteger(score) ? score : Math.floor(score);
  return {
    score: storedScore,
    color: WOT_SCORE_TO_LEVEL[storedScore as WotScore],
    legacy_color: Number.isInteger(score) ? null : String(score),
  };
}
