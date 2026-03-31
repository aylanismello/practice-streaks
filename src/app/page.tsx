"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  getEffectiveDate,
  getLast7Days,
  formatDisplayDate,
  getDayLabel,
} from "@/lib/dates";

interface PracticeType {
  id: string;
  name: string;
  emoji: string;
  sort_order: number;
}

interface PracticeLog {
  practice_date: string;
  practice_id: string;
}

function calculateStreak(
  practiceId: string,
  logs: PracticeLog[],
  today: string
): { count: number; doneToday: boolean } {
  const dates = new Set(
    logs
      .filter((l) => l.practice_id === practiceId)
      .map((l) => l.practice_date)
  );

  const doneToday = dates.has(today);
  let streak = 0;
  const d = new Date(today + "T12:00:00");

  // If not done today, start counting from yesterday
  // (the streak is still alive until end of day)
  if (!doneToday) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const dateStr = formatDateLocal(d);
    if (dates.has(dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return { count: streak, doneToday };
}

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StreakBadge({ count }: { count: number }) {
  if (count < 1) return null;
  const icon = count >= 7 ? "⭐" : count >= 3 ? "🔥" : "";
  if (!icon) return null;
  return (
    <span className="text-xs ml-1">
      {icon} {count}
    </span>
  );
}

function TripCountdown() {
  const tripDate = new Date("2026-05-21T00:00:00");
  const now = new Date();
  const diffMs = tripDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return null;

  return (
    <div className="mt-10 text-center">
      <div className="inline-block">
        <div className="text-[var(--text-muted)] text-xs uppercase tracking-[0.2em] mb-3">
          Countdown
        </div>
        <div className="text-lg md:text-xl font-medium tracking-wide mb-2">
          folie à trois{" "}
          <span className="inline-block" role="img" aria-label="China flag">
            🇨🇳
          </span>
        </div>
        <div className="text-5xl md:text-6xl font-light tabular-nums tracking-tight mb-2 text-[var(--text)]">
          {daysRemaining}
        </div>
        <div className="text-sm text-[var(--text-muted)] mb-1">
          {daysRemaining === 1 ? "day" : "days"}
        </div>
        <div className="text-xs text-[var(--text-muted)] opacity-60 tracking-wide">
          FangYuan Retreat · May 21
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [practices, setPractices] = useState<PracticeType[]>([]);
  const [logs, setLogs] = useState<PracticeLog[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const effectiveDate = getEffectiveDate();
    setToday(effectiveDate);

    const last7 = getLast7Days(effectiveDate);
    const startDate = last7[0];
    // Fetch extra days for streak calculation (up to 60 days back)
    const streakStart = new Date(effectiveDate + "T12:00:00");
    streakStart.setDate(streakStart.getDate() - 60);
    const streakStartStr = formatDateLocal(streakStart);

    const [typesRes, logsRes] = await Promise.all([
      supabase.from("practice_types").select("*").order("sort_order"),
      supabase
        .from("practice_log")
        .select("practice_date, practice_id")
        .gte("practice_date", streakStartStr)
        .lte("practice_date", effectiveDate),
    ]);

    if (typesRes.data) setPractices(typesRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel("practice_log_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "practice_log" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[var(--text-muted)] text-lg">Loading...</div>
      </div>
    );
  }

  const todayLogs = new Set(
    logs.filter((l) => l.practice_date === today).map((l) => l.practice_id)
  );
  const completedCount = todayLogs.size;
  const totalPractices = practices.length;
  const last7Days = getLast7Days(today);

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 py-6 md:py-10 pb-12">
      {/* Header */}
      <div className="text-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">
          Practice Streaks
        </h1>
        <p className="text-[var(--text-muted)] text-sm md:text-base">
          {formatDisplayDate(today)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6 md:mb-8 max-w-md mx-auto md:max-w-lg">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-[var(--text-muted)]">Today</span>
          <span className="text-sm font-medium">
            {completedCount}/{totalPractices}
          </span>
        </div>
        <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${totalPractices > 0 ? (completedCount / totalPractices) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Practice cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-8 md:mb-10">
        {practices.map((practice, i) => {
          const done = todayLogs.has(practice.id);
          const { count: streak, doneToday } = calculateStreak(practice.id, logs, today);
          const atRisk = streak > 0 && !doneToday;
          return (
            <div
              key={practice.id}
              className="animate-fade-in rounded-xl p-4 md:p-5 transition-colors duration-200"
              style={{
                animationDelay: `${i * 50}ms`,
                background: done ? "var(--accent-glow)" : "var(--bg-card)",
                border: `1px solid ${done ? "var(--accent)" : atRisk ? "rgba(255,165,0,0.3)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl md:text-3xl">{practice.emoji}</span>
                {done ? (
                  <span className="animate-check-pop text-[var(--accent)] text-lg md:text-xl">
                    ✓
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] text-lg md:text-xl">○</span>
                )}
              </div>
              <div className="text-sm md:text-base font-medium leading-tight">
                {practice.name}
              </div>
              {streak > 0 && (
                <div className={`text-xs md:text-sm mt-1 ${atRisk ? "text-orange-400" : "text-[var(--text-muted)]"}`}>
                  {streak}d streak{atRisk ? " ⚠️" : ""}
                  <StreakBadge count={streak} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly view — redesigned as label + dot matrix */}
      <div>
        <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
          Last 7 Days
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 md:p-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left pb-2 pr-3" />
                {last7Days.map((day) => (
                  <th
                    key={day}
                    className="text-center text-[10px] md:text-xs text-[var(--text-muted)] pb-2 font-normal px-1"
                  >
                    {getDayLabel(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {practices.map((practice) => (
                <tr key={practice.id}>
                  <td className="pr-3 py-1.5 whitespace-nowrap">
                    <span className="text-sm md:text-base">{practice.emoji}</span>
                    <span className="hidden md:inline text-xs text-[var(--text-muted)] ml-1.5">
                      {practice.name}
                    </span>
                  </td>
                  {last7Days.map((day) => {
                    const done = logs.some(
                      (l) =>
                        l.practice_date === day && l.practice_id === practice.id
                    );
                    return (
                      <td key={day} className="text-center py-1.5 px-1">
                        <span
                          className="inline-block w-5 h-5 md:w-6 md:h-6 rounded-full"
                          style={{
                            background: done ? "var(--accent)" : "transparent",
                            border: done ? "none" : "2px solid var(--border)",
                            opacity: done ? 1 : 0.5,
                          }}
                          title={`${practice.name} - ${day}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trip countdown */}
      <TripCountdown />
    </main>
  );
}
