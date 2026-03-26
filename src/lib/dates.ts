// Day boundary is 4am Pacific — a new "day" starts at 4am, not midnight.
const TIMEZONE = "America/Los_Angeles";
const DAY_START_HOUR = 4;

export function getEffectiveDate(now: Date = new Date()): string {
  // Convert to Pacific time
  const pacific = new Date(
    now.toLocaleString("en-US", { timeZone: TIMEZONE })
  );
  // If before 4am, it's still "yesterday"
  if (pacific.getHours() < DAY_START_HOUR) {
    pacific.setDate(pacific.getDate() - 1);
  }
  return formatDate(pacific);
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
