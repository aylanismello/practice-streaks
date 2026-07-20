export const WEEKLY_PRACTICES = [
  { id: "run", name: "Runs / Run-walks", emoji: "🏃", target: 2 },
  { id: "lift", name: "Full-body lifting", emoji: "🏋️", target: 2 },
  { id: "long_hike", name: "Long hike / hill walk", emoji: "🥾", target: 1 },
] as const;

export type WeeklyPracticeId = (typeof WEEKLY_PRACTICES)[number]["id"];

export const WEEKLY_PRACTICE_IDS = new Set<string>(
  WEEKLY_PRACTICES.map((practice) => practice.id)
);

export interface WeeklyPracticeLog {
  practice_date: string;
  practice_id: string;
}

export interface WeeklyPracticeProgress {
  count: number;
  target: number;
  dates: string[];
  doneToday: boolean;
}

export type WeeklyPracticeSummary = Record<
  WeeklyPracticeId,
  WeeklyPracticeProgress
>;

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMondayToSunday(dateStr: string): string[] {
  const date = new Date(`${dateStr}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setDate(day.getDate() + index);
    return formatDate(day);
  });
}

export function summarizeWeeklyPractices(
  logs: WeeklyPracticeLog[],
  today: string
): WeeklyPracticeSummary {
  const week = new Set(getMondayToSunday(today));
  const summary = {} as WeeklyPracticeSummary;

  for (const practice of WEEKLY_PRACTICES) {
    const dates = Array.from(
      new Set(
        logs
          .filter(
            (log) =>
              log.practice_id === practice.id && week.has(log.practice_date)
          )
          .map((log) => log.practice_date)
      )
    ).sort();

    summary[practice.id] = {
      count: dates.length,
      target: practice.target,
      dates,
      doneToday: dates.includes(today),
    };
  }

  return summary;
}
