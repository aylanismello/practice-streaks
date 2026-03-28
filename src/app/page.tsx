"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  getEffectiveDate,
  getLast7Days,
  formatDisplayDate,
  getDayLabel,
} from "@/lib/dates";

interface OuraData {
  sleep: { average_hrv: number; day: string }[];
  readiness: { score: number; day: string }[];
  resilience: { level: string; day: string }[];
  dailySleep: { score: number; day: string }[];
}

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

function getMonthRange(today: string, offset: number): { start: string; end: string } {
  const d = new Date(today + "T12:00:00");
  d.setMonth(d.getMonth() + offset);
  const year = d.getFullYear();
  const month = d.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function filterByMonth(items: { day: string }[], start: string, end: string) {
  return items.filter((i) => i.day >= start && i.day <= end);
}

function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaUnit,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: number | null;
  deltaUnit?: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
        {label}
      </div>
      <div className="text-2xl font-bold text-amber-400">
        {value}
        {unit && <span className="text-sm font-normal text-[var(--text-muted)] ml-0.5">{unit}</span>}
      </div>
      {delta !== null && (
        <div className={`text-xs mt-1 ${delta >= 0 ? "text-green-400" : "text-red-400"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(delta % 1 === 0 ? 0 : 1)}
          {deltaUnit ?? ""}
        </div>
      )}
    </div>
  );
}

function HrvChart({ data }: { data: { average_hrv: number; day: string }[] }) {
  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
  // Deduplicate by day (take last entry per day)
  const byDay = new Map<string, number>();
  for (const d of sorted) {
    if (d.average_hrv > 0) byDay.set(d.day, d.average_hrv);
  }
  const points = Array.from(byDay.entries()).map(([day, hrv]) => ({ day, hrv }));
  if (points.length < 2) return null;

  const hrvValues = points.map((p) => p.hrv);
  const minHrv = Math.floor(Math.min(...hrvValues) * 0.9);
  const maxHrv = Math.ceil(Math.max(...hrvValues) * 1.1);
  const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

  const w = 600;
  const h = 200;
  const pad = { top: 10, right: 10, bottom: 30, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xScale = (i: number) => pad.left + (i / (points.length - 1)) * plotW;
  const yScale = (v: number) =>
    pad.top + plotH - ((v - minHrv) / (maxHrv - minHrv)) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(p.hrv).toFixed(1)}`)
    .join(" ");

  const avgY = yScale(avgHrv);

  // X-axis labels: show ~6 labels
  const labelInterval = Math.max(1, Math.floor(points.length / 6));
  const xLabels = points.filter((_, i) => i % labelInterval === 0 || i === points.length - 1);

  // Y-axis labels
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(minHrv + (i / yTicks) * (maxHrv - minHrv))
  );

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
        HRV — Last 90 Days
      </h2>
      <div
        className="rounded-xl border border-[var(--border)] p-4"
        style={{ background: "var(--bg-card)" }}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 200 }}>
          {/* Y grid + labels */}
          {yLabels.map((v) => (
            <g key={v}>
              <line
                x1={pad.left}
                x2={w - pad.right}
                y1={yScale(v)}
                y2={yScale(v)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={pad.left - 6}
                y={yScale(v) + 4}
                textAnchor="end"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {v}
              </text>
            </g>
          ))}
          {/* Average dashed line */}
          <line
            x1={pad.left}
            x2={w - pad.right}
            y1={avgY}
            y2={avgY}
            stroke="#f59e0b"
            strokeWidth="1"
            strokeDasharray="6,4"
            opacity="0.5"
          />
          <text
            x={w - pad.right}
            y={avgY - 6}
            textAnchor="end"
            fill="#f59e0b"
            fontSize="10"
            opacity="0.7"
          >
            avg {Math.round(avgHrv)}
          </text>
          {/* Line */}
          <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2" />
          {/* X labels */}
          {xLabels.map((p) => {
            const i = points.indexOf(p);
            return (
              <text
                key={p.day}
                x={xScale(i)}
                y={h - 6}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="10"
              >
                {p.day.slice(5)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [practices, setPractices] = useState<PracticeType[]>([]);
  const [logs, setLogs] = useState<PracticeLog[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [ouraData, setOuraData] = useState<OuraData | null>(null);

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

    // Fetch Oura data (non-blocking)
    fetch("/api/oura")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setOuraData(data); })
      .catch(() => {});
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
          const { count: streak, doneToday } = calculateStreak(practice.id, logs, today);
          const atRisk = streak > 0 && !doneToday;
          return (
            <div
              key={practice.id}
              className="animate-fade-in rounded-xl p-4 transition-colors duration-200"
              style={{
                animationDelay: `${i * 50}ms`,
                background: done ? "var(--accent-glow)" : "var(--bg-card)",
                border: `1px solid ${done ? "var(--accent)" : atRisk ? "rgba(255,165,0,0.3)" : "var(--border)"}`,
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
                <div className={`text-xs mt-1 ${atRisk ? "text-orange-400" : "text-[var(--text-muted)]"}`}>
                  {streak}d streak{atRisk ? " ⚠️" : ""}
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

      {/* North Star Metrics */}
      {ouraData && today && (() => {
        const curr = getMonthRange(today, 0);
        const prev = getMonthRange(today, -1);

        const currSleep = filterByMonth(ouraData.sleep, curr.start, curr.end);
        const prevSleep = filterByMonth(ouraData.sleep, prev.start, prev.end);
        const currHrvVals = currSleep.map((s) => s.average_hrv).filter((v) => v > 0);
        const prevHrvVals = prevSleep.map((s) => s.average_hrv).filter((v) => v > 0);
        const avgHrv = currHrvVals.length > 0 ? currHrvVals.reduce((a, b) => a + b, 0) / currHrvVals.length : 0;
        const prevAvgHrv = prevHrvVals.length > 0 ? prevHrvVals.reduce((a, b) => a + b, 0) / prevHrvVals.length : 0;

        const currRes = filterByMonth(ouraData.resilience, curr.start, curr.end);
        const prevRes = filterByMonth(ouraData.resilience, prev.start, prev.end);
        const strongPct = currRes.length > 0 ? (currRes.filter((r) => r.level === "strong").length / currRes.length) * 100 : 0;
        const prevStrongPct = prevRes.length > 0 ? (prevRes.filter((r) => r.level === "strong").length / prevRes.length) * 100 : 0;

        // Consistency from practice_log
        const currMonth = curr.start.slice(0, 7);
        const prevMonth = prev.start.slice(0, 7);
        const currDaysWithPractice = new Set(logs.filter((l) => l.practice_date.startsWith(currMonth)).map((l) => l.practice_date)).size;
        const prevDaysWithPractice = new Set(logs.filter((l) => l.practice_date.startsWith(prevMonth)).map((l) => l.practice_date)).size;
        const daysInCurrMonth = new Date(parseInt(curr.start), parseInt(curr.start.slice(5, 7)), 0).getDate();
        const todayDay = parseInt(today.slice(8, 10));
        const effectiveDaysCurr = today.startsWith(currMonth) ? todayDay : daysInCurrMonth;
        const daysInPrevMonth = new Date(parseInt(prev.start), parseInt(prev.start.slice(5, 7)), 0).getDate();
        const consistencyPct = effectiveDaysCurr > 0 ? (currDaysWithPractice / effectiveDaysCurr) * 100 : 0;
        const prevConsistencyPct = daysInPrevMonth > 0 ? (prevDaysWithPractice / daysInPrevMonth) * 100 : 0;

        const currDailySleep = filterByMonth(ouraData.dailySleep, curr.start, curr.end);
        const prevDailySleep = filterByMonth(ouraData.dailySleep, prev.start, prev.end);
        const avgSleepScore = currDailySleep.length > 0 ? currDailySleep.reduce((a, b) => a + b.score, 0) / currDailySleep.length : 0;
        const prevAvgSleepScore = prevDailySleep.length > 0 ? prevDailySleep.reduce((a, b) => a + b.score, 0) / prevDailySleep.length : 0;

        return (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
              North Star Metrics
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Avg HRV"
                value={Math.round(avgHrv).toString()}
                unit="ms"
                delta={prevAvgHrv > 0 ? avgHrv - prevAvgHrv : null}
                deltaUnit="ms"
              />
              <MetricCard
                label="Resilience"
                value={Math.round(strongPct).toString()}
                unit="%"
                delta={prevRes.length > 0 ? strongPct - prevStrongPct : null}
                deltaUnit="%"
              />
              <MetricCard
                label="Consistency"
                value={Math.round(consistencyPct).toString()}
                unit="%"
                delta={prevDaysWithPractice > 0 ? consistencyPct - prevConsistencyPct : null}
                deltaUnit="%"
              />
              <MetricCard
                label="Sleep Score"
                value={Math.round(avgSleepScore).toString()}
                delta={prevAvgSleepScore > 0 ? avgSleepScore - prevAvgSleepScore : null}
              />
            </div>
          </div>
        );
      })()}

      {/* HRV Trend Chart */}
      {ouraData && <HrvChart data={ouraData.sleep} />}
    </main>
  );
}
