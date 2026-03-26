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
): number {
  const dates = new Set(
    logs
      .filter((l) => l.practice_id === practiceId)
      .map((l) => l.practice_date)
  );

  let streak = 0;
  const d = new Date(today + "T12:00:00");

  while (true) {
    const dateStr = formatDateLocal(d);
    if (dates.has(dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
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
    <main className="max-w-md mx-auto px-4 py-6 pb-12">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">
          Practice Streaks
        </h1>
        <p className="text-[var(--text-muted)] text-sm">
          {formatDisplayDate(today)}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
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
      <div className="grid grid-cols-2 gap-3 mb-8">
        {practices.map((practice, i) => {
          const done = todayLogs.has(practice.id);
          const streak = calculateStreak(practice.id, logs, today);
          return (
            <div
              key={practice.id}
              className="animate-fade-in rounded-xl p-4 transition-colors duration-200"
              style={{
                animationDelay: `${i * 50}ms`,
                background: done ? "var(--accent-glow)" : "var(--bg-card)",
                border: `1px solid ${done ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{practice.emoji}</span>
                {done ? (
                  <span className="animate-check-pop text-[var(--accent)] text-lg">
                    ✓
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] text-lg">○</span>
                )}
              </div>
              <div className="text-sm font-medium leading-tight">
                {practice.name}
              </div>
              {streak > 0 && (
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {streak}d streak
                  <StreakBadge count={streak} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Weekly view */}
      <div>
        <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
          Last 7 Days
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {last7Days.map((day) => (
              <div
                key={day}
                className="text-center text-[10px] text-[var(--text-muted)]"
              >
                {getDayLabel(day)}
              </div>
            ))}
          </div>

          {/* Practice rows */}
          {practices.map((practice) => (
            <div
              key={practice.id}
              className="grid grid-cols-7 gap-1 mb-1.5 items-center"
            >
              {last7Days.map((day) => {
                const done = logs.some(
                  (l) =>
                    l.practice_date === day && l.practice_id === practice.id
                );
                return (
                  <div key={day} className="flex justify-center">
                    <div
                      className="w-5 h-5 rounded-sm transition-colors duration-200"
                      style={{
                        background: done ? "var(--accent)" : "var(--border)",
                        opacity: done ? 1 : 0.4,
                      }}
                      title={`${practice.name} - ${day}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Practice labels */}
          <div className="mt-2 pt-2 border-t border-[var(--border)] flex flex-wrap gap-2">
            {practices.map((p) => (
              <span
                key={p.id}
                className="text-[10px] text-[var(--text-muted)]"
              >
                {p.emoji} {p.name.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
