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

function filterByMonth<T extends { day: string }>(items: T[], start: string, end: string): T[] {
  return items.filter((i) => i.day >= start && i.day <= end);
}

function HrvCard({ avg, delta }: { avg: number; delta: number | null }) {
  const context = delta === null ? null : Math.abs(delta) <= 2 ? "stable" : delta > 0 ? "trending up" : "trending down";
  const contextColor = context === "stable" ? "text-[var(--text-muted)]" : context === "trending up" ? "text-green-400" : "text-amber-400";
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Avg HRV</div>
      <div className="text-2xl font-bold text-amber-400">
        {Math.round(avg)}<span className="text-sm font-normal text-[var(--text-muted)] ml-0.5">ms</span>
      </div>
      {delta !== null && (
        <div className={`text-xs mt-1 ${contextColor}`}>
          {context} {context !== "stable" && `(${delta > 0 ? "+" : ""}${delta.toFixed(1)}ms)`}
        </div>
      )}
    </div>
  );
}

function ResilienceCard({
  distribution,
  prevStrongSolidPct,
}: {
  distribution: Record<string, number>;
  prevStrongSolidPct: number | null;
}) {
  const levels = ["exceptional", "strong", "solid", "adequate", "limited"] as const;
  const colors: Record<string, string> = {
    exceptional: "#eab308",
    strong: "#22c55e",
    solid: "#14b8a6",
    adequate: "#facc15",
    limited: "#ef4444",
  };
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const strongSolidPct = total > 0
    ? ((distribution.exceptional ?? 0) + (distribution.strong ?? 0) + (distribution.solid ?? 0)) / total * 100
    : 0;
  const delta = prevStrongSolidPct !== null ? strongSolidPct - prevStrongSolidPct : null;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Resilience</div>
      <div className="text-2xl font-bold text-amber-400 mb-2">
        {Math.round(strongSolidPct)}<span className="text-sm font-normal text-[var(--text-muted)] ml-0.5">% solid+</span>
      </div>
      {/* Stacked bar */}
      {total > 0 && (
        <div className="flex h-3 rounded-full overflow-hidden mb-2">
          {levels.map((level) => {
            const count = distribution[level] ?? 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <div
                key={level}
                style={{ width: `${pct}%`, backgroundColor: colors[level] }}
                title={`${level}: ${Math.round(pct)}%`}
              />
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {levels.map((level) => {
          const count = distribution[level] ?? 0;
          if (count === 0) return null;
          const pct = Math.round((count / total) * 100);
          return (
            <span key={level} className="text-[10px] text-[var(--text-muted)]">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{ backgroundColor: colors[level] }} />
              {pct}% {level}
            </span>
          );
        })}
      </div>
      {delta !== null && (
        <div className={`text-xs mt-1 ${delta >= 0 ? "text-green-400" : "text-amber-400"}`}>
          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs last month
        </div>
      )}
    </div>
  );
}

function ConsistencyCard({
  days,
  total,
  pct,
  delta,
}: {
  days: number;
  total: number;
  pct: number;
  delta: number | null;
}) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Consistency</div>
      <div className="flex items-center gap-3">
        <svg width="52" height="52" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={radius} fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle
            cx="26" cy="26" r={radius} fill="none"
            stroke="#f59e0b" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform="rotate(-90 26 26)"
          />
          <text x="26" y="26" textAnchor="middle" dominantBaseline="central" fill="#f59e0b" fontSize="12" fontWeight="bold">
            {Math.round(pct)}%
          </text>
        </svg>
        <div>
          <div className="text-sm font-medium text-[var(--text)]">{days}/{total} days</div>
          {delta !== null && (
            <div className={`text-xs ${delta >= 0 ? "text-green-400" : "text-amber-400"}`}>
              {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}% vs last month
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WindowCard() {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", opacity: 0.6 }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Window of Tolerance</div>
      <div className="text-2xl font-bold text-[var(--text-muted)]">—</div>
      <div className="text-xs mt-1 text-[var(--text-muted)]">Weekly check-in</div>
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

function TripCountdown({ inline }: { inline?: boolean }) {
  const tripDate = new Date("2026-05-21T00:00:00");
  const now = new Date();
  const diffMs = tripDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return null;

  if (inline) {
    // Compact version for top-right on desktop
    return (
      <div className="text-right">
        <div className="text-[var(--text-muted)] text-[10px] uppercase tracking-[0.15em] mb-1">
          folie à trois 🇨🇳
        </div>
        <div className="text-3xl font-light tabular-nums tracking-tight text-[var(--text)]">
          {daysRemaining}
        </div>
        <div className="text-[10px] text-[var(--text-muted)]">
          days · May 21
        </div>
      </div>
    );
  }

  return (
    <div className="mt-10 text-center">
      <div className="inline-block">
        <div className="text-[var(--text-muted)] text-xs uppercase tracking-[0.2em] mb-3">
          Countdown
        </div>
        <div className="text-lg font-medium tracking-wide mb-2">
          folie à trois{" "}
          <span className="inline-block" role="img" aria-label="China flag">
            🇨🇳
          </span>
        </div>
        <div className="text-5xl font-light tabular-nums tracking-tight mb-2 text-[var(--text)]">
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
    <main className="max-w-[960px] mx-auto px-4 md:px-8 py-6 md:py-10 pb-12">
      {/* Header with countdown */}
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div className="flex-1">
          <h1 className="text-xl md:text-3xl font-semibold tracking-tight mb-0.5 md:mb-1">
            A.F.M&apos;s Practice
          </h1>
          <p className="text-[var(--text-muted)] text-xs md:text-base">
            {formatDisplayDate(today)}
          </p>
        </div>
        <TripCountdown inline />
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

      {/* North Star Metrics */}
      {ouraData && today && (() => {
        const curr = getMonthRange(today, 0);
        const prev = getMonthRange(today, -1);

        // HRV
        const currSleep = filterByMonth(ouraData.sleep, curr.start, curr.end);
        const prevSleep = filterByMonth(ouraData.sleep, prev.start, prev.end);
        const currHrvVals = currSleep.map((s) => s.average_hrv).filter((v) => v > 0);
        const prevHrvVals = prevSleep.map((s) => s.average_hrv).filter((v) => v > 0);
        const avgHrv = currHrvVals.length > 0 ? currHrvVals.reduce((a, b) => a + b, 0) / currHrvVals.length : 0;
        const prevAvgHrv = prevHrvVals.length > 0 ? prevHrvVals.reduce((a, b) => a + b, 0) / prevHrvVals.length : 0;
        const hrvDelta = prevAvgHrv > 0 ? avgHrv - prevAvgHrv : null;

        // Resilience distribution
        const currRes = filterByMonth(ouraData.resilience, curr.start, curr.end);
        const prevRes = filterByMonth(ouraData.resilience, prev.start, prev.end);
        const currDist: Record<string, number> = {};
        for (const r of currRes) currDist[r.level] = (currDist[r.level] ?? 0) + 1;
        const prevTotal = prevRes.length;
        const prevStrongSolidPct = prevTotal > 0
          ? (prevRes.filter((r) => ["exceptional", "strong", "solid"].includes(r.level)).length / prevTotal) * 100
          : null;

        // Consistency
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

        return (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
              North Star Metrics
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <HrvCard avg={avgHrv} delta={hrvDelta} />
              <WindowCard />
              <ResilienceCard distribution={currDist} prevStrongSolidPct={prevStrongSolidPct} />
              <ConsistencyCard
                days={currDaysWithPractice}
                total={effectiveDaysCurr}
                pct={consistencyPct}
                delta={prevDaysWithPractice > 0 ? consistencyPct - prevConsistencyPct : null}
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
