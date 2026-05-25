// Day boundary is 4am in the active practice timezone — a new "day" starts at 4am, not midnight.
// Default to LA for server/fallback callers, but the client should pass the browser timezone
// so travel works naturally (ex: China Saturday morning is Saturday, not LA Friday).
export const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DAY_START_HOUR = 4;

export function getEffectiveDate(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const local = new Date(
    now.toLocaleString("en-US", { timeZone })
  );
  // If before 4am in the active practice timezone, it's still "yesterday"
  if (local.getHours() < DAY_START_HOUR) {
    local.setDate(local.getDate() - 1);
  }
  return formatDate(local);
}

export interface PracticeDateRequest {
  date?: string;
  timeZone?: string;
  browserTimeZone?: string;
}

export function resolvePracticeDate(
  body: PracticeDateRequest,
  now: Date = new Date()
): string {
  if (body.date) return body.date;
  return getEffectiveDate(now, body.timeZone || body.browserTimeZone || DEFAULT_TIMEZONE);
}

export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLast7Days(today: string): string[] {
  const days: string[] = [];
  const d = new Date(today + "T12:00:00");
  for (let i = 6; i >= 0; i--) {
    const date = new Date(d);
    date.setDate(date.getDate() - i);
    days.push(formatDate(date));
  }
  return days;
}

export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export type ViewMode = "7d" | "14d" | "month";

export function getDaysForRange(
  today: string,
  mode: ViewMode,
  offset: number
): string[] {
  const d = new Date(today + "T12:00:00");

  if (mode === "month") {
    d.setMonth(d.getMonth() - offset);
    const year = d.getFullYear();
    const month = d.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(formatDate(new Date(year, month, i)));
    }
    return days;
  }

  const count = mode === "7d" ? 7 : 14;
  d.setDate(d.getDate() - offset * count);
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(d);
    date.setDate(date.getDate() - i);
    days.push(formatDate(date));
  }
  return days;
}

export function getRangeLabel(
  today: string,
  mode: ViewMode,
  offset: number
): string {
  const days = getDaysForRange(today, mode, offset);
  if (mode === "month") {
    const d = new Date(days[0] + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const first = new Date(days[0] + "T12:00:00");
  const last = new Date(days[days.length - 1] + "T12:00:00");
  const fmtFirst = first.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtLast = last.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmtFirst} – ${fmtLast}`;
}

export function getMondayStartPadding(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  return (d.getDay() + 6) % 7;
}
