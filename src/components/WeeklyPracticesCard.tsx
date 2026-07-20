"use client";

import {
  WEEKLY_PRACTICES,
  summarizeWeeklyPractices,
  type WeeklyPracticeLog,
} from "@/lib/weekly-practices";

interface WeeklyPracticesCardProps {
  logs: WeeklyPracticeLog[];
  today: string;
  togglingId: string | null;
  onToggle: (practiceId: string, doneToday: boolean) => void;
}

export function WeeklyPracticesCard({
  logs,
  today,
  togglingId,
  onToggle,
}: WeeklyPracticesCardProps) {
  const summary = summarizeWeeklyPractices(logs, today);

  return (
    <section
      className="rounded-xl p-4 md:p-5 mb-8 md:mb-10"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-muted)] mb-3">
        This week
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        {WEEKLY_PRACTICES.map((practice) => {
          const progress = summary[practice.id];
          const complete = progress.count >= progress.target;
          const extra = Math.max(0, progress.count - progress.target);
          const busy = togglingId === practice.id;

          return (
            <button
              key={practice.id}
              type="button"
              disabled={busy}
              onClick={() => onToggle(practice.id, progress.doneToday)}
              className="rounded-xl p-3 text-left transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: complete ? "var(--accent-glow)" : "var(--bg)",
                border: `1px solid ${complete ? "var(--accent)" : "var(--border)"}`,
              }}
              title={progress.doneToday ? "Remove today’s entry" : "Log this for today"}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-2xl">{practice.emoji}</span>
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: complete ? "var(--accent)" : "var(--text)" }}
                >
                  {Math.min(progress.count, progress.target)}/{progress.target}
                  {extra > 0 ? (
                    <span className="text-[10px] ml-1 text-[var(--text-muted)]">+{extra}</span>
                  ) : null}
                </span>
              </div>

              <div className="text-sm font-medium mt-2 leading-tight">{practice.name}</div>

              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1" aria-label={`${progress.count} of ${progress.target}`}>
                  {Array.from({ length: practice.target }, (_, index) => (
                    <span
                      key={index}
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: index < progress.count ? "var(--accent)" : "transparent",
                        border: index < progress.count ? "none" : "1px solid var(--border)",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {progress.doneToday ? "today ✓" : "+ today"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
