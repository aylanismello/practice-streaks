"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  getEffectiveDate,
  getLast7Days,
  formatDisplayDate,
  getDayLabel,
  getDaysForRange,
  getRangeLabel,
} from "@/lib/dates";
import type { ViewMode } from "@/lib/dates";

const WIND_DOWN = "23:00"; // 11:00 PM — no screens
const IN_BED = "23:30"; // 11:30 PM — in bed, lights out
const TARGET_BEDTIME = "00:00"; // midnight — asleep by (oura measures this)
const WAKE_TARGET = "08:30"; // 8:30 AM — wake up
const TRACKING_START = "2026-03-21"; // First day practices were logged

interface OuraData {
  sleep: { average_hrv: number | null; day: string; bedtime_start: string | null; bedtime_end: string | null; total_sleep_duration: number | null; latency: number | null }[];
  readiness: { score: number; day: string }[];
  resilience: { level: string; day: string; contributors?: { sleep_recovery?: number; daytime_recovery?: number; stress?: number } }[];
  dailySleep: { score: number; day: string }[];
  stress: { day: string; stress_high: number; recovery_high: number; day_summary: string | null }[];
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

interface WotEntry {
  date: string;
  color: "green" | "yellow" | "red";
}

interface FocusmateSession {
  date: string;       // YYYY-MM-DD in Pacific
  duration: number;   // minutes
  completed: boolean;
}

interface FocusmateData {
  sessions: FocusmateSession[];
  profile: {
    totalSessionCount: number;
    memberSince: string;
  };
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


function HrvCard({ avg, delta }: { avg: number; delta: number | null }) {
  const isStable = delta === null || Math.abs(delta) <= 3;
  const label = delta === null ? null : isStable ? "stable" : delta > 0 ? "shifting up" : "shifting down";
  const labelColor = isStable ? "text-green-400" : "text-amber-400";
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">❤️ HRV · 30d avg</div>
      <div className="text-2xl font-bold text-amber-400">
        {Math.round(avg)}<span className="text-sm font-normal text-[var(--text-muted)] ml-0.5">ms</span>
      </div>
      {label !== null && (
        <div className={`text-xs mt-1 ${labelColor}`}>
          {label}{!isStable && ` (${delta! > 0 ? "+" : ""}${delta!.toFixed(1)}ms)`}
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
  const displayLevels = ["strong", "solid", "adequate"] as const;
  const colors: Record<string, string> = {
    exceptional: "#eab308",
    strong: "#22c55e",
    solid: "#14b8a6",
    adequate: "#facc15",
    limited: "#ef4444",
  };
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const strongSolidCount = (distribution.exceptional ?? 0) + (distribution.strong ?? 0) + (distribution.solid ?? 0);
  const strongSolidPct = total > 0 ? (strongSolidCount / total) * 100 : 0;
  const delta = prevStrongSolidPct !== null ? strongSolidPct - prevStrongSolidPct : null;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Resilience · 30d</div>
      <div className="text-2xl font-bold text-amber-400 mb-2">
        {Math.round(strongSolidPct)}<span className="text-sm font-normal text-[var(--text-muted)] ml-0.5">% solid+</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
        {displayLevels.map((level) => {
          const count = (level === "strong" ? (distribution.exceptional ?? 0) + (distribution.strong ?? 0) : distribution[level] ?? 0);
          if (count === 0) return null;
          return (
            <span key={level} className="text-[10px] text-[var(--text-muted)]">
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-0.5" style={{ backgroundColor: colors[level] }} />
              {count}d {level}
            </span>
          );
        })}
      </div>
      {delta !== null && (
        <div className={`text-xs mt-1 ${Math.abs(delta) <= 5 ? "text-green-400" : delta >= 0 ? "text-green-400" : "text-amber-400"}`}>
          {Math.abs(delta) <= 5 ? "stable" : delta >= 0 ? `+${Math.abs(delta).toFixed(0)}%` : `−${Math.abs(delta).toFixed(0)}%`} vs prior 30d
        </div>
      )}
    </div>
  );
}

function ConsistencyLine({
  days,
  totalDays,
}: {
  days: number;
  totalDays: number;
}) {
  const pct = totalDays > 0 ? Math.round((days / totalDays) * 100) : 0;
  return (
    <div className="mt-2 text-center text-xs text-[var(--text-muted)]">
      Practiced <span className="text-[var(--text)] font-medium">{days}</span> of {totalDays} tracked days
      <span className="text-[var(--text-muted)]"> · {pct}%</span>
    </div>
  );
}

function StressBalanceCard({
  stressData,
}: {
  stressData: OuraData["stress"];
}) {
  if (stressData.length === 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Stress · 30d</div>
        <div className="text-xs text-[var(--text-muted)]">No data yet</div>
      </div>
    );
  }

  const recoveryDays = stressData.filter((s) => s.recovery_high >= s.stress_high).length;
  const stressDays = stressData.length - recoveryDays;
  const balanced = recoveryDays >= stressDays;
  const ratio = stressData.length > 0 ? recoveryDays / stressData.length : 0;

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Stress · 30d</div>
      <div className={`text-lg font-bold mb-1 ${balanced ? "text-green-400" : "text-amber-400"}`}>
        {balanced ? "balanced" : "high load"}
      </div>
      {/* Balance bar */}
      <div className="flex h-2 rounded-full overflow-hidden mb-2">
        <div
          className="h-full"
          style={{ width: `${ratio * 100}%`, backgroundColor: "#4ade80" }}
        />
        <div
          className="h-full"
          style={{ width: `${(1 - ratio) * 100}%`, backgroundColor: "#fbbf24" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{recoveryDays}d recovery</span>
        <span>{stressDays}d stress</span>
      </div>
    </div>
  );
}


function parseBedtimeMinutes(iso: string): number | null {
  // bedtime_start is like "2026-04-01T00:40:27-07:00"
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  return hours * 60 + minutes;
}

function getTargetMinutes(target: string): number {
  const [h, m] = target.split(":").map(Number);
  return h * 60 + m;
}

function bedtimeDeltaMinutes(actualMinutes: number, targetMinutes: number): number {
  // Normalize around midnight: times from 6PM-midnight are "before midnight" (negative offset),
  // times from midnight-noon are "after midnight" (positive offset)
  // This way 11:30 PM = -30, 1:00 AM = 60, etc.
  const normalize = (m: number) => (m >= 18 * 60 ? m - 24 * 60 : m);
  return normalize(actualMinutes) - normalize(targetMinutes);
}

function formatTime12h(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

type FrameStatus = "complete" | "partial" | "missed";

interface SleepFrame {
  slept_on_time: boolean;
  woke_on_time: boolean;
  status: FrameStatus;
}

/** Check if a bedtime_start ISO timestamp is nighttime (8pm–6am Pacific) */
function isNighttimeSleep(bedtimeStart: string): boolean {
  const pt = new Date(new Date(bedtimeStart).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const h = pt.getHours();
  return h >= 20 || h < 6;
}

/** Pick the nighttime sleep entry per day — filters out naps by requiring bedtime_start between 8pm-6am Pacific */
function getLongestSleepByDay(sleepData: OuraData["sleep"]): Map<string, OuraData["sleep"][number]> {
  const byDay = new Map<string, OuraData["sleep"][number]>();
  for (const s of sleepData) {
    if (!s.bedtime_start && !s.bedtime_end) continue;
    // Filter: only consider entries where bedtime_start is nighttime (8pm-6am Pacific)
    if (s.bedtime_start && !isNighttimeSleep(s.bedtime_start)) continue;
    const existing = byDay.get(s.day);
    if (!existing) {
      byDay.set(s.day, s);
    } else {
      // If multiple nighttime entries, prefer the one with later bedtime_start
      const existingStart = existing.bedtime_start ?? "";
      const newStart = s.bedtime_start ?? "";
      if (newStart > existingStart) byDay.set(s.day, s);
    }
  }
  return byDay;
}

function scoreSleepFrame(entry: OuraData["sleep"][number]): SleepFrame | null {
  const { bedtime_start, bedtime_end } = entry;
  if (!bedtime_start && !bedtime_end) return null;

  // Parse bedtime_start time in Pacific — ISO like "2026-04-01T00:40:27-07:00"
  let slept_on_time = false;
  if (bedtime_start) {
    const ptBed = new Date(new Date(bedtime_start).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const bedMinutes = ptBed.getHours() * 60 + ptBed.getMinutes();
    // On time = bedtime_start time <= midnight (00:00)
    // Normalize: evening times (18:00-23:59) and midnight (0:00) are on time
    // After midnight (0:01+) is late — but we use the normalize trick
    const normalized = bedMinutes >= 18 * 60 ? bedMinutes - 24 * 60 : bedMinutes;
    slept_on_time = normalized <= 0; // <= midnight
  }

  let woke_on_time = false;
  if (bedtime_end) {
    const ptWake = new Date(new Date(bedtime_end).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const wakeMinutes = ptWake.getHours() * 60 + ptWake.getMinutes();
    const wakeTarget = getTargetMinutes(WAKE_TARGET); // 8:30 = 510
    woke_on_time = wakeMinutes <= wakeTarget;
  }

  const bothHit = slept_on_time && woke_on_time;
  const oneHit = slept_on_time || woke_on_time;
  return {
    slept_on_time,
    woke_on_time,
    status: bothHit ? "complete" : oneHit ? "partial" : "missed",
  };
}

function BedtimeCard({ sleepData, today, logs, practices }: { sleepData: OuraData["sleep"]; today: string; logs: PracticeLog[]; practices: PracticeType[] }) {
  const targetMin = getTargetMinutes(TARGET_BEDTIME);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const nowPT = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const nowHour = nowPT.getHours();
  const isEvening = nowHour >= 21; // 9 PM+

  // Last night's actual bedtime from Oura
  const sorted = [...sleepData]
    .filter((s) => s.bedtime_start)
    .sort((a, b) => b.day.localeCompare(a.day));
  const latest = sorted[0];

  const actualMin = latest?.bedtime_start ? parseBedtimeMinutes(latest.bedtime_start) : null;
  const lastNightDelta = actualMin !== null ? bedtimeDeltaMinutes(actualMin, targetMin) : null;
  const lastNightAbsMin = lastNightDelta !== null ? Math.abs(lastNightDelta) : null;

  let lastNightDeltaLabel: string | null = null;
  if (lastNightDelta !== null && lastNightAbsMin !== null) {
    if (lastNightAbsMin <= 15) {
      lastNightDeltaLabel = "on time";
    } else if (lastNightDelta > 0) {
      lastNightDeltaLabel = `${lastNightAbsMin}m late`;
    } else {
      lastNightDeltaLabel = `${lastNightAbsMin}m early`;
    }
  }
  const deltaColor = lastNightDelta === null ? "" : Math.abs(lastNightDelta) <= 15 ? "text-green-400" : Math.abs(lastNightDelta) <= 45 ? "text-amber-400" : "text-amber-400";

  if (isEvening) {
    // Evening mode: countdown + routine status
    const nowMinutes = nowPT.getHours() * 60 + nowPT.getMinutes();
    const normalizeNow = nowMinutes >= 18 * 60 ? nowMinutes - 24 * 60 : nowMinutes;
    const normalizeTarget = targetMin >= 18 * 60 ? targetMin - 24 * 60 : targetMin;
    const minutesUntil = normalizeTarget - normalizeNow;

    let countdownLabel: string;
    let countdownColor: string;
    if (minutesUntil > 0) {
      const h = Math.floor(minutesUntil / 60);
      const m = minutesUntil % 60;
      countdownLabel = h > 0 ? `${h}h ${m}m` : `${m}m`;
      countdownColor = "text-green-400";
    } else {
      const pastMin = Math.abs(minutesUntil);
      const h = Math.floor(pastMin / 60);
      const m = pastMin % 60;
      countdownLabel = h > 0 ? `+${h}h ${m}m` : `+${m}m`;
      countdownColor = "text-amber-400";
    }

    const nighttimePractice = practices.find(
      (p) => p.id === "nighttime" || p.name.toLowerCase().includes("nighttime") || p.name.toLowerCase().includes("night")
    );
    const nighttimeDone = nighttimePractice
      ? logs.some((l) => l.practice_date === today && l.practice_id === nighttimePractice.id)
      : false;

    return (
      <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Bedtime</div>
        <div className={`text-2xl font-bold mb-1 ${countdownColor}`}>{countdownLabel}</div>
        <div className="text-xs text-[var(--text-muted)]">
          {minutesUntil > 0 ? "until bedtime" : "past bedtime"}
        </div>
        <div className={`text-xs mt-2 ${nighttimeDone ? "text-green-400" : "text-amber-400"}`}>
          {nighttimeDone ? "routine done ✓" : "routine not started"}
        </div>
      </div>
    );
  }

  // Daytime mode: last night's bedtime only
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Bedtime</div>
      {actualMin !== null ? (
        <>
          <div className="text-2xl font-bold text-amber-400">
            {formatTime12h(actualMin)}
          </div>
          {lastNightDeltaLabel && (
            <div className={`text-xs mt-1 ${deltaColor}`}>
              {lastNightDeltaLabel}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-[var(--text-muted)]">No data</div>
      )}
    </div>
  );
}

type HrvTimeRange = "30D" | "90D" | "Q" | "1Y";

function getQuarterStart(date: Date): Date {
  const month = date.getMonth();
  const qMonth = month - (month % 3);
  return new Date(date.getFullYear(), qMonth, 1);
}

function filterByTimeRange<T extends { day: string }>(data: T[], range: HrvTimeRange): T[] {
  const now = new Date();
  let cutoff: Date;
  switch (range) {
    case "30D": cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30); break;
    case "90D": cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 90); break;
    case "Q": cutoff = getQuarterStart(now); break;
    case "1Y": cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); break;
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return data.filter((d) => d.day >= cutoffStr);
}

const RESILIENCE_COLORS: Record<string, string> = {
  limited: "rgba(239,68,68,0.08)",
  adequate: "rgba(234,179,8,0.07)",
  solid: "transparent",
  strong: "rgba(34,197,94,0.06)",
  exceptional: "rgba(34,197,94,0.1)",
};

function HrvChart({
  data,
  resilienceData,
}: {
  data: { average_hrv: number | null; day: string }[];
  resilienceData: OuraData["resilience"];
}) {
  const [range, setRange] = useState<HrvTimeRange>("90D");

  if (data.length === 0) return null;

  const filteredData = filterByTimeRange(data, range);
  const filteredResilience = filterByTimeRange(resilienceData, range);

  const sorted = [...filteredData].sort((a, b) => a.day.localeCompare(b.day));
  const byDay = new Map<string, number>();
  for (const d of sorted) {
    if (d.average_hrv && d.average_hrv > 0) byDay.set(d.day, d.average_hrv);
  }
  const points = Array.from(byDay.entries()).map(([day, hrv]) => ({ day, hrv }));
  if (points.length < 2) return null;

  // Resilience maps — map level to numeric value for step-line
  const RESILIENCE_LEVEL_VALUE: Record<string, number> = { limited: 20, adequate: 40, solid: 60, strong: 80, exceptional: 100 };
  const resilienceByDay = new Map<string, { level: string; value: number }>();
  for (const r of filteredResilience) {
    resilienceByDay.set(r.day, { level: r.level, value: RESILIENCE_LEVEL_VALUE[r.level] ?? 0 });
  }

  const hrvValues = points.map((p) => p.hrv);
  const minHrv = Math.floor(Math.min(...hrvValues) * 0.9);
  const maxHrv = Math.ceil(Math.max(...hrvValues) * 1.1);
  const avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;

  // Resilience Y axis (0-100)
  const resMin = 0;
  const resMax = 100;

  const w = 600;
  const h = 220;
  const pad = { top: 16, right: 44, bottom: 30, left: 40 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xScale = (i: number) => pad.left + (i / (points.length - 1)) * plotW;
  const yScale = (v: number) =>
    pad.top + plotH - ((v - minHrv) / (maxHrv - minHrv)) * plotH;
  const resYScale = (v: number) =>
    pad.top + plotH - ((v - resMin) / (resMax - resMin)) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(p.hrv).toFixed(1)}`)
    .join(" ");

  // Resilience level line (step-line)
  const resPoints = points
    .map((p, i) => ({ i, day: p.day, val: resilienceByDay.get(p.day)?.value }))
    .filter((p): p is { i: number; day: string; val: number } => p.val != null);

  const resPathD = resPoints.length >= 2
    ? resPoints.map((p, idx) => `${idx === 0 ? "M" : "L"}${xScale(p.i).toFixed(1)},${resYScale(p.val).toFixed(1)}`).join(" ")
    : null;

  const avgY = yScale(avgHrv);

  // X-axis labels
  const labelInterval = Math.max(1, Math.floor(points.length / 6));
  const xLabels = points.filter((_, i) => {
    if (i % labelInterval === 0) return true;
    if (i === points.length - 1) {
      const prevLabelIdx = Math.floor((points.length - 1) / labelInterval) * labelInterval;
      return (i - prevLabelIdx) > labelInterval * 0.5;
    }
    return false;
  });

  // Y-axis labels (HRV left)
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(minHrv + (i / yTicks) * (maxHrv - minHrv))
  );

  // Right Y-axis labels (resilience 0-100)
  const resTicks = [0, 25, 50, 75, 100];

  // Build background band rects for resilience levels
  const bandRects: { x: number; width: number; color: string }[] = [];
  for (let i = 0; i < points.length; i++) {
    const res = resilienceByDay.get(points[i].day);
    if (!res) continue;
    const color = RESILIENCE_COLORS[res.level];
    if (!color || color === "transparent") continue;
    const x0 = i === 0 ? pad.left : (xScale(i - 1) + xScale(i)) / 2;
    const x1 = i === points.length - 1 ? w - pad.right : (xScale(i) + xScale(i + 1)) / 2;
    bandRects.push({ x: x0, width: x1 - x0, color });
  }

  const ranges: HrvTimeRange[] = ["30D", "90D", "Q", "1Y"];

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
          ❤️ HRV + Resilience
        </h2>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: range === r ? "var(--text-muted)" : "transparent",
                color: range === r ? "var(--bg-card)" : "var(--text-muted)",
                border: range === r ? "none" : "1px solid var(--border)",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div
        className="rounded-xl border border-[var(--border)] p-4"
        style={{ background: "var(--bg-card)" }}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 220 }}>
          {/* Resilience level background bands */}
          {bandRects.map((b, i) => (
            <rect key={`band-${i}`} x={b.x} y={pad.top} width={b.width} height={plotH} fill={b.color} />
          ))}
          {/* Y grid + HRV labels (left) */}
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
          {/* Right Y axis labels (resilience) */}
          {resTicks.map((v) => (
            <text key={`res-${v}`} x={w - pad.right + 6} y={resYScale(v) + 4} textAnchor="start" fill="#60a5fa" fontSize="9" opacity="0.7">
              {v}
            </text>
          ))}
          <text x={pad.left} y={pad.top - 4} textAnchor="start" fill="#f59e0b" fontSize="9" opacity="0.7">HRV (ms)</text>
          <text x={w - pad.right} y={pad.top - 4} textAnchor="end" fill="#60a5fa" fontSize="9" opacity="0.7">Resilience</text>
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
          {/* HRV line */}
          <path d={pathD} fill="none" stroke="#f59e0b" strokeWidth="2" />
          {/* Sleep recovery line */}
          {resPathD && <path d={resPathD} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4,2" opacity="0.8" />}
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

function TonightCard({
  logs,
  practices,
  today,
  sleepData,
}: {
  logs: PracticeLog[];
  practices: PracticeType[];
  today: string;
  sleepData: OuraData["sleep"];
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const nowPT = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const nowHour = nowPT.getHours();
  const nowMinutes = nowPT.getHours() * 60 + nowPT.getMinutes();

  // Only show after 9 PM Pacific
  if (nowHour < 21) return null;

  // Check if nighttime routine is logged today
  const nighttimePractice = practices.find(
    (p) => p.id === "nighttime" || p.name.toLowerCase().includes("nighttime") || p.name.toLowerCase().includes("night")
  );
  const nighttimeDone = nighttimePractice
    ? logs.some((l) => l.practice_date === today && l.practice_id === nighttimePractice.id)
    : false;

  // Frame checkpoint times
  const routineMin = getTargetMinutes(WIND_DOWN); // 22:00 = 1320
  const bedMin = getTargetMinutes(TARGET_BEDTIME); // 00:00 = 0
  const wakeMin = getTargetMinutes(WAKE_TARGET); // 08:30 = 510

  // Bedtime countdown
  const normalizeNow = nowMinutes >= 18 * 60 ? nowMinutes - 24 * 60 : nowMinutes;
  const normalizeBed = bedMin >= 18 * 60 ? bedMin - 24 * 60 : bedMin;
  const minutesUntilBed = normalizeBed - normalizeNow;

  // Determine checkpoint statuses
  const routineOpen = nowMinutes >= routineMin || nowHour < 6; // past 10:30pm or early morning
  const pastMidnight = nowHour < 6; // after midnight, before 6am

  // Check if last night's sleep data is available for scoring
  const longestByDay = getLongestSleepByDay(sleepData);
  const todaySleep = longestByDay.get(today);
  const frame = todaySleep ? scoreSleepFrame(todaySleep) : null;

  // Build checkpoint sequence
  type Checkpoint = { label: string; status: "upcoming" | "active" | "done" | "scored"; scored?: boolean };
  const checkpoints: Checkpoint[] = [];

  // Wind down checkpoint (10pm)
  const inBedMin = getTargetMinutes(IN_BED); // 23:00 = 1380
  const pastInBed = nowMinutes >= inBedMin || nowHour < 6;
  if (!routineOpen) {
    checkpoints.push({ label: "no screens 11pm", status: "upcoming" });
  } else {
    checkpoints.push({ label: "no screens 11pm", status: nighttimeDone ? "done" : "active" });
  }

  // In bed checkpoint (11pm)
  if (!routineOpen) {
    checkpoints.push({ label: "in bed 11:30pm", status: "upcoming" });
  } else if (!pastInBed) {
    const minsUntilBed11 = inBedMin - nowMinutes;
    const h = Math.floor(minsUntilBed11 / 60);
    const m = minsUntilBed11 % 60;
    checkpoints.push({ label: `in bed 11:30pm (${h > 0 ? `${h}h ${m}m` : `${m}m`})`, status: "active" });
  } else {
    checkpoints.push({ label: "in bed 11:30pm", status: "done" });
  }

  // Asleep checkpoint (midnight)
  if (!pastMidnight) {
    let bedLabel = "asleep by midnight";
    if (minutesUntilBed > 0) {
      const h = Math.floor(minutesUntilBed / 60);
      const m = minutesUntilBed % 60;
      bedLabel = `asleep by midnight (${h > 0 ? `${h}h ${m}m` : `${m}m`})`;
    }
    checkpoints.push({ label: bedLabel, status: "active" });
  } else {
    checkpoints.push({ label: "asleep by midnight", status: "scored", scored: frame?.slept_on_time ?? false });
  }

  // Wake checkpoint
  if (pastMidnight && frame) {
    checkpoints.push({ label: "wake by 8:30", status: "scored", scored: frame.woke_on_time });
  } else {
    checkpoints.push({ label: "wake by 8:30", status: "upcoming" });
  }

  const borderColor = nighttimeDone ? "var(--accent)" : "rgba(251,191,36,0.3)";

  return (
    <div
      className="rounded-xl p-4 mb-4"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Tonight</div>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {checkpoints.map((cp, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[var(--text-muted)]">→</span>}
            <span className={
              cp.status === "done" ? "text-green-400" :
              cp.status === "active" ? "text-amber-400" :
              cp.status === "scored" ? (cp.scored ? "text-green-400" : "text-red-400") :
              "text-[var(--text-muted)]"
            }>
              {cp.label}
              {cp.status === "done" && " ✓"}
              {cp.status === "scored" && (cp.scored ? " ✓" : " ✗")}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function PatternsSection({
  logs,
  ouraData,
}: {
  logs: PracticeLog[];
  ouraData: OuraData;
}) {
  // Build date-indexed maps
  const practiceCountByDate = new Map<string, number>();
  for (const l of logs) {
    practiceCountByDate.set(l.practice_date, (practiceCountByDate.get(l.practice_date) ?? 0) + 1);
  }

  const hrvByDate = new Map<string, number>();
  for (const s of ouraData.sleep) {
    if (s.average_hrv && s.average_hrv > 0) hrvByDate.set(s.day, s.average_hrv);
  }

  const sleepScoreByDate = new Map<string, number>();
  for (const s of ouraData.dailySleep) {
    if (s.score && s.score > 0) sleepScoreByDate.set(s.day, s.score);
  }

  const bedtimeByDate = new Map<string, number>();
  for (const s of ouraData.sleep) {
    if (s.bedtime_start) {
      const min = parseBedtimeMinutes(s.bedtime_start);
      if (min !== null) bedtimeByDate.set(s.day, min);
    }
  }

  // Find overlapping dates (dates with both practice data and oura data)
  const allDates = new Set([...practiceCountByDate.keys()]);
  const overlapDates = [...allDates].filter((d) => hrvByDate.has(d) || sleepScoreByDate.has(d));

  if (overlapDates.length < 7) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
          Patterns
        </h2>
        <div
          className="rounded-xl border border-[var(--border)] p-6 text-center"
          style={{ background: "var(--bg-card)" }}
        >
          <div className="text-sm text-[var(--text-muted)]">Need more data — keep logging</div>
        </div>
      </div>
    );
  }

  // 1. Practice days vs rest days HRV
  const practiceDayHrvs: number[] = [];
  const restDayHrvs: number[] = [];
  for (const [date, hrv] of hrvByDate) {
    const count = practiceCountByDate.get(date) ?? 0;
    if (count >= 3) practiceDayHrvs.push(hrv);
    else if (count <= 1) restDayHrvs.push(hrv);
  }
  const avgPracticeHrv = practiceDayHrvs.length > 0
    ? practiceDayHrvs.reduce((a, b) => a + b, 0) / practiceDayHrvs.length
    : null;
  const avgRestHrv = restDayHrvs.length > 0
    ? restDayHrvs.reduce((a, b) => a + b, 0) / restDayHrvs.length
    : null;

  // 2. Next-day effect: sleep score after practice days vs after rest days
  const sortedDates = [...new Set([...practiceCountByDate.keys(), ...sleepScoreByDate.keys()])].sort();
  const afterPracticeScores: number[] = [];
  const afterRestScores: number[] = [];
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const thisDate = sortedDates[i];
    const nextDate = sortedDates[i + 1];
    // Check if next date is actually the next day
    const d1 = new Date(thisDate + "T12:00:00");
    const d2 = new Date(nextDate + "T12:00:00");
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / (86400000));
    if (diffDays !== 1) continue;

    const count = practiceCountByDate.get(thisDate) ?? 0;
    const nextScore = sleepScoreByDate.get(nextDate);
    if (nextScore === undefined) continue;

    if (count >= 3) afterPracticeScores.push(nextScore);
    else if (count <= 1) afterRestScores.push(nextScore);
  }
  const avgAfterPractice = afterPracticeScores.length > 0
    ? afterPracticeScores.reduce((a, b) => a + b, 0) / afterPracticeScores.length
    : null;
  const avgAfterRest = afterRestScores.length > 0
    ? afterRestScores.reduce((a, b) => a + b, 0) / afterRestScores.length
    : null;

  // 3. Bedtime consistency: delta on days with nighttime practice vs without
  const nighttimePracticeIds = new Set(
    logs
      .filter((l) => l.practice_id === "nighttime" || l.practice_id.includes("night"))
      .map((l) => l.practice_date)
  );
  const targetMin = getTargetMinutes(TARGET_BEDTIME);
  const withRoutineDeltas: number[] = [];
  const withoutRoutineDeltas: number[] = [];
  for (const [date, actualMin] of bedtimeByDate) {
    const delta = Math.abs(bedtimeDeltaMinutes(actualMin, targetMin));
    if (nighttimePracticeIds.has(date)) withRoutineDeltas.push(delta);
    else withoutRoutineDeltas.push(delta);
  }
  const avgWithRoutine = withRoutineDeltas.length > 0
    ? withRoutineDeltas.reduce((a, b) => a + b, 0) / withRoutineDeltas.length
    : null;
  const avgWithoutRoutine = withoutRoutineDeltas.length > 0
    ? withoutRoutineDeltas.reduce((a, b) => a + b, 0) / withoutRoutineDeltas.length
    : null;

  const StatRow = ({
    label,
    leftLabel,
    leftValue,
    rightLabel,
    rightValue,
    unit,
  }: {
    label: string;
    leftLabel: string;
    leftValue: number | null;
    rightLabel: string;
    rightValue: number | null;
    unit: string;
  }) => {
    if (leftValue === null || rightValue === null) return null;
    const max = Math.max(leftValue, rightValue);
    return (
      <div className="py-3 border-b border-[var(--border)] last:border-0">
        <div className="text-xs text-[var(--text-muted)] mb-2">{label}</div>
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--text-muted)]">{leftLabel}</span>
              <span className="text-sm font-medium text-[var(--text)]">
                {Math.round(leftValue)}{unit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-green-400"
                style={{ width: `${max > 0 ? (leftValue / max) * 100 : 0}%` }}
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--text-muted)]">{rightLabel}</span>
              <span className="text-sm font-medium text-[var(--text)]">
                {Math.round(rightValue)}{unit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${max > 0 ? (rightValue / max) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const hasAnyData =
    (avgPracticeHrv !== null && avgRestHrv !== null) ||
    (avgAfterPractice !== null && avgAfterRest !== null) ||
    (avgWithRoutine !== null && avgWithoutRoutine !== null);

  if (!hasAnyData) {
    return (
      <div className="mt-8">
        <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
          Patterns
        </h2>
        <div
          className="rounded-xl border border-[var(--border)] p-6 text-center"
          style={{ background: "var(--bg-card)" }}
        >
          <div className="text-sm text-[var(--text-muted)]">Need more data — keep logging</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
        Patterns
      </h2>
      <div
        className="rounded-xl border border-[var(--border)] p-4"
        style={{ background: "var(--bg-card)" }}
      >
        <StatRow
          label="HRV on practice days (3+) vs rest days (0-1)"
          leftLabel="Practice"
          leftValue={avgPracticeHrv}
          rightLabel="Rest"
          rightValue={avgRestHrv}
          unit="ms"
        />
        <StatRow
          label="Sleep score after practice days vs rest days"
          leftLabel="After practice"
          leftValue={avgAfterPractice}
          rightLabel="After rest"
          rightValue={avgAfterRest}
          unit=""
        />
        <StatRow
          label="Bedtime delta with nighttime routine vs without"
          leftLabel="With routine"
          leftValue={avgWithRoutine}
          rightLabel="Without"
          rightValue={avgWithoutRoutine}
          unit="m"
        />
      </div>
    </div>
  );
}

interface FlowLog {
  id: string;
  date: string;
  duration_min: number;
  completed_at: string;
}

// Persistent AudioContext — created on first user interaction, reused for all chimes
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx || _audioCtx.state === "closed") {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === "suspended") {
    _audioCtx.resume();
  }
  return _audioCtx;
}

function playChime() {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Gentle three-tone ascending chime — louder for audibility
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.3);
      gain.gain.linearRampToValueAtTime(0.4, now + i * 0.3 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 1.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 1.2);
    });
  } catch {
    // Audio not available — silently fail
  }
}

const POMO_BG_IMAGE = "https://images.unsplash.com/photo-1601575972982-e428ea86be7d?q=80&w=3087&auto=format&fit=crop";

function FlowTimer({
  open,
  onClose,
  flowLogs,
  duration,
  onDurationChange,
  running,
  secondsLeft,
  sessionWaves,
  justCompleted,
  onStart,
  onStop,
  onSecondsLeftChange,
  onAnotherRound,
  onDoneForNow,
}: {
  open: boolean;
  onClose: () => void;
  flowLogs: FlowLog[];
  duration: number;
  onDurationChange: (d: number) => void;
  running: boolean;
  secondsLeft: number;
  sessionWaves: number[];
  justCompleted: boolean;
  onStart: () => void;
  onStop: () => void;
  onSecondsLeftChange: (s: number) => void;
  onAnotherRound: () => void;
  onDoneForNow: () => void;
}) {
  const [holdProgress, setHoldProgress] = useState(0);
  const [editingDuration, setEditingDuration] = useState(false);
  const [flowShowHistory, setFlowShowHistory] = useState(false);
  // Always open to timer view, not calendar
  useEffect(() => {
    if (open) setFlowShowHistory(false);
  }, [open]);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startHold = () => {
    setHoldProgress(0);
    let p = 0;
    holdTimerRef.current = setInterval(() => {
      p += 5;
      setHoldProgress(p);
      if (p >= 100) {
        if (holdTimerRef.current) clearInterval(holdTimerRef.current);
        onStop();
      }
    }, 50);
  };

  const endHold = () => {
    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    setHoldProgress(0);
  };

  // Escape key minimizes modal
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const todayFlows = flowLogs.filter((p) => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return p.date === `${y}-${m}-${d}`;
  });

  if (!open) return null;

  const bgStyle = {
    backgroundImage: `url(${POMO_BG_IMAGE})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  // --- Completion screen ---
  if (justCompleted) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden" style={bgStyle}>
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.65)" }} />
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 text-white/80 hover:text-white text-4xl font-light transition-colors w-12 h-12 flex items-center justify-center"
        >
          ×
        </button>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="text-6xl md:text-7xl font-light text-white" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>
            🌊 Done!
          </div>
          {sessionWaves.length > 0 && (
            <div className="text-2xl tracking-wide">
              {sessionWaves.map((_, i) => <span key={i}>🌊</span>)}
            </div>
          )}
          <div className="text-white/70 text-sm font-medium">
            {sessionWaves.length} flow{sessionWaves.length !== 1 ? "s" : ""} this session
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={onAnotherRound}
              className="rounded-full px-8 py-3 text-lg font-semibold transition-all active:scale-95"
              style={{ background: "#38bdf8", color: "#0a0a0f" }}
            >
              Another round
            </button>
            <button
              onClick={onDoneForNow}
              className="rounded-full px-8 py-3 text-lg font-semibold transition-all active:scale-95"
              style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              Done for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Running: fullscreen immersive timer ---
  if (running) {
    const totalSeconds = duration * 60;
    const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
    const ringSize = 380;
    const ringSizeMobile = 300;
    const strokeWidth = 3;
    const radius = (ringSize - strokeWidth * 2) / 2;
    const radiusMobile = (ringSizeMobile - strokeWidth * 2) / 2;
    const circumference = 2 * Math.PI * radius;
    const circumferenceMobile = 2 * Math.PI * radiusMobile;
    const dashoffset = circumference * (1 - progress);
    const dashoffsetMobile = circumferenceMobile * (1 - progress);

    // Ambient mist particles — positions and timing
    const particles = [
      { left: "15%", delay: "0s", duration: "14s", opacity: 0.12 },
      { left: "35%", delay: "3s", duration: "18s", opacity: 0.08 },
      { left: "55%", delay: "7s", duration: "16s", opacity: 0.15 },
      { left: "72%", delay: "2s", duration: "20s", opacity: 0.1 },
      { left: "88%", delay: "5s", duration: "15s", opacity: 0.07 },
      { left: "48%", delay: "10s", duration: "17s", opacity: 0.13 },
    ];

    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden" style={bgStyle}>
        <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.50)" }} />
        {/* Ambient particle CSS */}
        <style>{`
          @keyframes mist-rise {
            0% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: var(--p-opacity); }
            90% { opacity: var(--p-opacity); }
            100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
          }
          @keyframes breathe-timer {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.01); }
          }
        `}</style>
        {/* Ambient mist particles */}
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute z-10 rounded-full"
            style={{
              width: 3,
              height: 3,
              background: "white",
              left: p.left,
              bottom: "-10px",
              ["--p-opacity" as string]: p.opacity,
              opacity: 0,
              animation: `mist-rise ${p.duration} ${p.delay} infinite ease-in-out`,
            }}
          />
        ))}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 z-10 text-white/80 hover:text-white text-4xl font-light transition-colors w-12 h-12 flex items-center justify-center"
        >
          ×
        </button>
        <div className="relative z-10 flex flex-col items-center">
          {/* Progress ring + centered timer */}
          <div className="relative flex items-center justify-center" style={{ width: ringSizeMobile, height: ringSizeMobile }}>
            <svg className="absolute inset-0 block md:hidden" width={ringSizeMobile} height={ringSizeMobile} viewBox={`0 0 ${ringSizeMobile} ${ringSizeMobile}`}>
              <defs>
                <filter id="flowGlow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <circle
                cx={ringSizeMobile / 2} cy={ringSizeMobile / 2} r={radiusMobile}
                fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={strokeWidth}
              />
              <circle
                cx={ringSizeMobile / 2} cy={ringSizeMobile / 2} r={radiusMobile}
                fill="none" stroke="rgba(56,189,248,0.6)" strokeWidth={strokeWidth} filter="url(#flowGlow)"
                strokeLinecap="round"
                strokeDasharray={circumferenceMobile}
                strokeDashoffset={dashoffsetMobile}
                transform={`rotate(-90 ${ringSizeMobile / 2} ${ringSizeMobile / 2})`}
                style={{ transition: "stroke-dashoffset 0.5s linear" }}
              />
            </svg>
            <svg className="absolute inset-0 hidden md:block" width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={{ left: -(ringSize - ringSizeMobile) / 2, top: -(ringSize - ringSizeMobile) / 2 }}>
              <circle
                cx={ringSize / 2} cy={ringSize / 2} r={radius}
                fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={strokeWidth}
              />
              <circle
                cx={ringSize / 2} cy={ringSize / 2} r={radius}
                fill="none" stroke="rgba(56,189,248,0.6)" strokeWidth={strokeWidth} filter="url(#flowGlow)"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
                style={{ transition: "stroke-dashoffset 0.5s linear" }}
              />
            </svg>
            <div
              className="relative text-7xl md:text-8xl font-light tabular-nums text-white"
              style={{
                textShadow: "0 2px 30px rgba(0,0,0,0.3)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.05em",
                animation: "breathe-timer 6s ease-in-out infinite",
              }}
            >
              {`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
            </div>
          </div>
          {/* Stop button — hold to stop */}
          <div className="mt-12">
            <div
              className="relative select-none cursor-pointer flex items-center justify-center rounded-full transition-all"
              style={{
                width: 56,
                height: 56,
                background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              onMouseDown={startHold}
              onMouseUp={endHold}
              onMouseLeave={() => endHold()}
              onTouchStart={startHold}
              onTouchEnd={endHold}
            >
              {holdProgress > 0 ? (
                <svg width={44} height={44} viewBox="0 0 44 44" className="absolute">
                  <circle cx={22} cy={22} r={19} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={2} />
                  <circle
                    cx={22} cy={22} r={19} fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2}
                    strokeDasharray={2 * Math.PI * 19}
                    strokeDashoffset={2 * Math.PI * 19 * (1 - holdProgress / 100)}
                    transform="rotate(-90 22 22)"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}
              <span className="text-white/70 text-2xl font-light">×</span>
            </div>
            <div className="text-white/30 text-[10px] mt-2 text-center">hold to stop</div>
          </div>
          {sessionWaves.length > 0 && (
            <div className="mt-10 text-2xl tracking-wide" style={{ opacity: 0.6 }}>
              {sessionWaves.map((_, i) => <span key={i}>🌊</span>)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Pre-start screen: duration selector on immersive background ---
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden" style={bgStyle}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.75)" }} />
      <button
        onClick={() => setFlowShowHistory((v) => !v)}
        className="absolute top-6 left-6 z-10 text-lg transition-all w-10 h-10 flex items-center justify-center rounded-full"
        style={{
          background: flowShowHistory ? "rgba(56,189,248,0.2)" : "transparent",
          color: flowShowHistory ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
        }}
        title="Flow history"
      >
        📅
      </button>
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-10 text-white/80 hover:text-white text-4xl font-light transition-colors w-12 h-12 flex items-center justify-center"
      >
        ×
      </button>
      {flowShowHistory ? (
        <div className="relative z-10 w-full max-w-md px-4 overflow-y-auto max-h-[80vh]">
          <FlowHistoryView flowLogs={flowLogs} />
        </div>
      ) : (
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Timer display / custom input */}
        <div
          className="text-7xl md:text-8xl font-extralight tabular-nums text-white"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)", fontVariantNumeric: "tabular-nums" }}
        >
          {editingDuration ? (
            <div className="flex items-center gap-2">
              <input
                ref={customInputRef}
                type="number"
                min={1}
                max={120}
                defaultValue={duration}
                className="w-28 text-center text-6xl font-extralight rounded-xl border-2 bg-transparent outline-none text-white"
                style={{ borderColor: "rgba(255,255,255,0.3)" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = Math.max(1, Math.min(120, parseInt((e.target as HTMLInputElement).value) || 20));
                    onDurationChange(v);
                    onSecondsLeftChange(v * 60);
                    setEditingDuration(false);
                  }
                }}
                onBlur={(e) => {
                  const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 20));
                  onDurationChange(v);
                  onSecondsLeftChange(v * 60);
                  setEditingDuration(false);
                }}
                autoFocus
              />
              <span className="text-2xl text-white/60">min</span>
            </div>
          ) : (
            <span
              onClick={() => setEditingDuration(true)}
              className="cursor-pointer hover:opacity-80"
              title="Tap to set custom time"
            >
              {`${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}
            </span>
          )}
        </div>

        {/* Duration pills */}
        {!editingDuration && (
          <div className="flex flex-wrap justify-center gap-2">
            {[15, 20, 25, 30, 45, 60].map((d) => (
              <button
                key={d}
                onClick={() => { onDurationChange(d); onSecondsLeftChange(d * 60); }}
                className="rounded-full px-4 py-1.5 text-sm font-medium transition-all"
                style={{
                  background: duration === d ? "#38bdf8" : "rgba(255,255,255,0.1)",
                  color: duration === d ? "#0a0a0f" : "rgba(255,255,255,0.7)",
                  border: duration === d ? "1px solid #38bdf8" : "1px solid rgba(255,255,255,0.2)",
                }}
              >
                {d}m
              </button>
            ))}
          </div>
        )}

        {/* Start button */}
        <button
          onClick={onStart}
          className="rounded-full px-10 py-3 text-lg font-semibold transition-all active:scale-95 mt-2"
          style={{ background: "#38bdf8", color: "#0a0a0f" }}
        >
          Start Focus
        </button>

        {/* Today stats */}
        {todayFlows.length > 0 && (
          <div className="text-white/50 text-xs font-medium mt-4">
            {todayFlows.length} flows today · {todayFlows.reduce((a, p) => a + p.duration_min, 0)} min focused
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function FlowHistoryView({ flowLogs }: { flowLogs: FlowLog[] }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
  const todayStr = formatDateLocal(now);

  // Build lookup: date -> FlowLog[]
  const logsByDate = new Map<string, FlowLog[]>();
  for (const log of flowLogs) {
    const existing = logsByDate.get(log.date) || [];
    existing.push(log);
    logsByDate.set(log.date, existing);
  }

  // Stats
  const totalFlows = flowLogs.length;
  const totalMinutes = flowLogs.reduce((a, p) => a + p.duration_min, 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  // Streak: consecutive days with at least 1 flow
  let streak = 0;
  const checkDate = new Date(now);
  if (!logsByDate.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  for (;;) {
    const ds = formatDateLocal(checkDate);
    if (logsByDate.has(ds)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Build month grid
  const firstOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const startDow = firstOfMonth.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const y = viewDate.getFullYear();
    const m = String(viewDate.getMonth() + 1).padStart(2, "0");
    cells.push(`${y}-${m}-${String(d).padStart(2, "0")}`);
  }

  const selectedLogs = selectedDay ? (logsByDate.get(selectedDay) || []) : [];
  const selectedCount = selectedLogs.length;
  const selectedMinutes = selectedLogs.reduce((a, p) => a + p.duration_min, 0);

  return (
    <div className="animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {[
          { label: "Total 🌊", value: totalFlows },
          { label: totalMinutes < 60 ? "Focus minutes" : "Focus hours", value: totalMinutes < 60 ? totalMinutes : totalHours },
          { label: "Day streak", value: streak },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-3 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="text-lg md:text-xl font-semibold tabular-nums">{stat.value}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Month Calendar */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-2">
          <button
            onClick={() => setMonthOffset(monthOffset - 1)}
            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm px-1"
          >
            &lsaquo;
          </button>
          <span className="text-[var(--text-muted)]">{monthLabel}</span>
          {monthOffset < 0 && (
            <button
              onClick={() => setMonthOffset(monthOffset + 1)}
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm px-1"
            >
              &rsaquo;
            </button>
          )}
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-3 md:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-[var(--text-muted)] pb-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const dayLogs = logsByDate.get(day) || [];
              const count = dayLogs.length;
              const isToday = day === todayStr;
              const isSelected = day === selectedDay;

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(selectedDay === day ? null : day)}
                  className="relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all duration-150"
                  style={{
                    background: isSelected
                      ? "rgba(245,158,11,0.2)"
                      : count > 0
                      ? "rgba(245,158,11,0.06)"
                      : "transparent",
                    border: isToday
                      ? "1px solid rgba(245,158,11,0.4)"
                      : count > 0
                      ? "1px solid rgba(245,158,11,0.15)"
                      : "1px solid var(--border)",
                    cursor: "pointer",
                  }}
                >
                  <span className="text-[10px] text-[var(--text-muted)] leading-none mb-0.5">
                    {parseInt(day.slice(8, 10), 10)}
                  </span>
                  {count > 0 && (
                    <span className="text-amber-400 font-semibold text-[11px] leading-none">
                      {count > 1 ? `${count}🌊` : "🌊"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedCount > 0 && (
        <div
          className="rounded-xl p-3 md:p-4 mb-4"
          style={{ background: "var(--bg-card)", border: "1px solid rgba(245,158,11,0.2)" }}
        >
          <div className="text-sm font-medium mb-1" style={{ color: "#f59e0b" }}>
            {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          </div>
          <div className="text-sm text-[var(--text-muted)]">
            {selectedCount} 🌊 · {selectedMinutes}m focused
          </div>
        </div>
      )}
    </div>
  );
}

function TripCountdown({ inline, onClick, isActive }: { inline?: boolean; onClick?: () => void; isActive?: boolean }) {
  const tripDate = new Date("2026-05-21T00:00:00");
  const now = new Date();
  const diffMs = tripDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) return null;

  if (inline) {
    // Compact version for top-right on desktop
    return (
      <button
        onClick={onClick}
        className="text-right rounded-xl px-3 py-2 -mr-3 -mt-2 transition-all duration-200"
        style={{
          background: isActive ? "rgba(245, 158, 11, 0.1)" : "transparent",
          border: isActive ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid transparent",
          cursor: "pointer",
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: isActive ? "#f59e0b" : "var(--text-muted)" }}>
          folie à trois 🇨🇳
        </div>
        <div className="text-3xl font-light tabular-nums tracking-tight" style={{ color: isActive ? "#f59e0b" : "var(--text)" }}>
          {daysRemaining}
        </div>
        <div className="text-[10px]" style={{ color: isActive ? "rgba(245, 158, 11, 0.7)" : "var(--text-muted)" }}>
          days · May 21
        </div>
      </button>
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

interface HistoryMonth {
  month: string;
  avgHrv: number | null;
  avgSleepScore: number | null;
  avgReadinessScore: number | null;
  resilience: { exceptional: number; strong: number; solid: number; adequate: number; limited: number };
  stressBalance: { stressDays: number; recoveryDays: number };
  totalNights: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type YearView = "year" | "quarter" | "month";

function YourYear({ months, ouraData }: { months: HistoryMonth[]; ouraData: OuraData | null }) {
  const [view, setView] = useState<YearView>("year");

  if (months.length < 3) return null;

  // Skip partial first/last months — use first and last COMPLETE months
  const first = months.length > 2 ? months[1] : months[0];
  const last = months.length > 2 ? months[months.length - 2] : months[months.length - 1];

  // --- Build chart data based on view ---
  type ChartPoint = { key: string; label: string; hrv: number | null; readiness: number | null };
  let chartPoints: ChartPoint[] = [];

  if (view === "year") {
    chartPoints = months.map((m) => ({
      key: m.month,
      label: MONTH_LABELS[parseInt(m.month.slice(5, 7), 10) - 1],
      hrv: m.avgHrv,
      readiness: m.avgReadinessScore,
    }));
  } else if (view === "quarter" && ouraData) {
    const today = new Date();
    const threeMonthsAgo = new Date(today);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const startStr = threeMonthsAgo.toISOString().slice(0, 10);

    const sleepInRange = ouraData.sleep.filter((s) => s.day >= startStr);
    const readinessInRange = ouraData.readiness.filter((r) => r.day >= startStr);

    const weeks = new Map<string, { hrvs: number[]; readinesses: number[]; label: string }>();
    const getWeekKey = (day: string) => {
      const d = new Date(day + "T00:00:00");
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const monthLabel = MONTH_LABELS[d.getMonth()];
      return { key: `${d.getFullYear()}-W${weekNum}`, label: `W${weekNum} ${monthLabel}` };
    };

    for (const s of sleepInRange) {
      if (s.average_hrv == null || s.average_hrv <= 0) continue;
      const { key, label } = getWeekKey(s.day);
      if (!weeks.has(key)) weeks.set(key, { hrvs: [], readinesses: [], label });
      weeks.get(key)!.hrvs.push(s.average_hrv);
    }
    for (const r of readinessInRange) {
      const { key, label } = getWeekKey(r.day);
      if (!weeks.has(key)) weeks.set(key, { hrvs: [], readinesses: [], label });
      weeks.get(key)!.readinesses.push(r.score);
    }

    const sortedKeys = [...weeks.keys()].sort();
    chartPoints = sortedKeys.map((k) => {
      const w = weeks.get(k)!;
      return {
        key: k,
        label: w.label,
        hrv: w.hrvs.length > 0 ? Math.round(w.hrvs.reduce((a, b) => a + b, 0) / w.hrvs.length) : null,
        readiness: w.readinesses.length > 0 ? Math.round(w.readinesses.reduce((a, b) => a + b, 0) / w.readinesses.length) : null,
      };
    });
  } else if (view === "month" && ouraData) {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const sleepByDay = new Map(ouraData.sleep.filter((s) => s.day >= startStr).map((s) => [s.day, s]));
    const readinessByDay = new Map(ouraData.readiness.filter((r) => r.day >= startStr).map((r) => [r.day, r]));

    const allDays = new Set([...sleepByDay.keys(), ...readinessByDay.keys()]);
    const sortedDays = [...allDays].sort();

    chartPoints = sortedDays.map((day) => {
      const d = new Date(day + "T00:00:00");
      const hrv = sleepByDay.get(day)?.average_hrv;
      return {
        key: day,
        label: `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`,
        hrv: hrv != null && hrv > 0 ? hrv : null,
        readiness: readinessByDay.get(day)?.score ?? null,
      };
    });
  }

  // --- Dual-axis chart from chartPoints ---
  const hrvPoints = chartPoints.filter((p) => p.hrv != null).map((p) => ({ key: p.key, val: p.hrv! }));
  const readinessPoints = chartPoints.filter((p) => p.readiness != null).map((p) => ({ key: p.key, val: p.readiness! }));

  const w = 600;
  const h = 220;
  const pad = { top: 14, right: 46, bottom: 30, left: 46 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const hrvVals = hrvPoints.map((p) => p.val);
  const hrvMin = hrvVals.length > 0 ? Math.floor(Math.min(...hrvVals) * 0.92) : 0;
  const hrvMax = hrvVals.length > 0 ? Math.ceil(Math.max(...hrvVals) * 1.08) : 100;
  const hrvY = (v: number) => pad.top + plotH - ((v - hrvMin) / (hrvMax - hrvMin || 1)) * plotH;

  const rdnVals = readinessPoints.map((p) => p.val);
  const rdnMin = rdnVals.length > 0 ? Math.floor(Math.min(...rdnVals) * 0.92) : 0;
  const rdnMax = rdnVals.length > 0 ? Math.ceil(Math.max(...rdnVals) * 1.08) : 100;
  const rdnY = (v: number) => pad.top + plotH - ((v - rdnMin) / (rdnMax - rdnMin || 1)) * plotH;

  const allKeys = chartPoints.map((p) => p.key);
  const xScale = (key: string) => {
    const i = allKeys.indexOf(key);
    return pad.left + (allKeys.length > 1 ? (i / (allKeys.length - 1)) * plotW : plotW / 2);
  };

  const hrvPath = hrvPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.key).toFixed(1)},${hrvY(p.val).toFixed(1)}`)
    .join(" ");
  const rdnPath = readinessPoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.key).toFixed(1)},${rdnY(p.val).toFixed(1)}`)
    .join(" ");

  const hrvTicks = Array.from({ length: 4 }, (_, i) => Math.round(hrvMin + (i / 3) * (hrvMax - hrvMin)));
  const rdnTicks = Array.from({ length: 4 }, (_, i) => Math.round(rdnMin + (i / 3) * (rdnMax - rdnMin)));

  // X labels — show subset to avoid overlap
  const maxLabels = view === "month" ? 10 : view === "quarter" ? 8 : chartPoints.length;
  const step = chartPoints.length > maxLabels ? Math.ceil(chartPoints.length / maxLabels) : 1;
  const xLabels = chartPoints
    .filter((_, i) => i % step === 0 || i === chartPoints.length - 1)
    .map((p) => ({ key: p.key, label: p.label }));

  // --- Summary calculations ---
  const hrvDelta = first.avgHrv != null && last.avgHrv != null ? last.avgHrv - first.avgHrv : null;
  const hrvLabel = hrvDelta != null ? (Math.abs(hrvDelta) <= 3 ? "stable" : hrvDelta > 0 ? "improving" : "declining") : null;

  const sleepDelta = first.avgSleepScore != null && last.avgSleepScore != null ? last.avgSleepScore - first.avgSleepScore : null;
  const sleepLabel = sleepDelta != null ? (Math.abs(sleepDelta) <= 2 ? "stable" : sleepDelta > 0 ? "improving" : "declining") : null;

  const rdnDelta = first.avgReadinessScore != null && last.avgReadinessScore != null ? last.avgReadinessScore - first.avgReadinessScore : null;
  const rdnLabel = rdnDelta != null ? (Math.abs(rdnDelta) <= 2 ? "stable" : rdnDelta > 0 ? "improving" : "declining") : null;

  const resTotal = (m: HistoryMonth) => m.resilience.exceptional + m.resilience.strong + m.resilience.solid + m.resilience.adequate + m.resilience.limited;
  const strongPct = (m: HistoryMonth) => {
    const t = resTotal(m);
    return t > 0 ? Math.round(((m.resilience.exceptional + m.resilience.strong) / t) * 100) : null;
  };
  const firstStrongPct = strongPct(first);
  const lastStrongPct = strongPct(last);

  const firstRecoveryPct = (first.stressBalance.recoveryDays + first.stressBalance.stressDays) > 0
    ? Math.round((first.stressBalance.recoveryDays / (first.stressBalance.recoveryDays + first.stressBalance.stressDays)) * 100)
    : null;
  const lastRecoveryPct = (last.stressBalance.recoveryDays + last.stressBalance.stressDays) > 0
    ? Math.round((last.stressBalance.recoveryDays / (last.stressBalance.recoveryDays + last.stressBalance.stressDays)) * 100)
    : null;

  const labelColor = (label: string | null) =>
    label === "improving" ? "#22c55e" : label === "declining" ? "#ef4444" : "#a1a1aa";

  const summaries = [
    first.avgHrv != null && last.avgHrv != null
      ? { emoji: "❤️", name: "HRV", text: `${first.avgHrv}ms → ${last.avgHrv}ms`, label: hrvLabel, color: labelColor(hrvLabel) }
      : null,
    first.avgSleepScore != null && last.avgSleepScore != null
      ? { emoji: "😴", name: "Sleep", text: `${first.avgSleepScore} → ${last.avgSleepScore}`, label: sleepLabel, color: labelColor(sleepLabel) }
      : null,
    first.avgReadinessScore != null && last.avgReadinessScore != null
      ? { emoji: "💪", name: "Readiness", text: `${first.avgReadinessScore} → ${last.avgReadinessScore}`, label: rdnLabel, color: labelColor(rdnLabel) }
      : null,
    firstStrongPct != null && lastStrongPct != null
      ? { emoji: "🛡️", name: "Resilience", text: `${firstStrongPct}% → ${lastStrongPct}% strong`, label: null, color: "#a1a1aa" }
      : null,
    firstRecoveryPct != null && lastRecoveryPct != null
      ? { emoji: "⚖️", name: "Stress Balance", text: `${firstRecoveryPct}% → ${lastRecoveryPct}% recovery`, label: null, color: "#a1a1aa" }
      : null,
  ].filter(Boolean) as { emoji: string; name: string; text: string; label: string | null; color: string }[];

  const viewTitle = view === "year" ? "Your Year" : view === "quarter" ? "Last Quarter" : "Last 30 Days";

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {viewTitle}
        </h2>
        <div className="flex gap-1">
          {(["year", "quarter", "month"] as YearView[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
              style={{
                background: view === mode ? "var(--accent)" : "var(--bg-card)",
                color: view === mode ? "#000" : "var(--text-muted)",
                border: `1px solid ${view === mode ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {mode === "year" ? "Year" : mode === "quarter" ? "Quarter" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Dual-axis chart */}
      <div
        className="rounded-xl border border-[var(--border)] p-4"
        style={{ background: "var(--bg-card)" }}
      >
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 220 }}>
          {/* Grid lines */}
          {hrvTicks.map((v) => (
            <line key={`g-${v}`} x1={pad.left} x2={w - pad.right} y1={hrvY(v)} y2={hrvY(v)} stroke="var(--border)" strokeWidth="1" />
          ))}
          {/* Left Y axis labels (HRV) */}
          {hrvTicks.map((v) => (
            <text key={`hl-${v}`} x={pad.left - 6} y={hrvY(v) + 4} textAnchor="end" fill="#f59e0b" fontSize="10">{v}</text>
          ))}
          {/* Right Y axis labels (Readiness) */}
          {rdnTicks.map((v) => (
            <text key={`rl-${v}`} x={w - pad.right + 6} y={rdnY(v) + 4} textAnchor="start" fill="#2dd4bf" fontSize="10">{v}</text>
          ))}
          {/* Axis titles */}
          <text x={pad.left} y={pad.top - 3} textAnchor="start" fill="#f59e0b" fontSize="9" opacity="0.7">HRV (ms)</text>
          <text x={w - pad.right} y={pad.top - 3} textAnchor="end" fill="#2dd4bf" fontSize="9" opacity="0.7">Readiness</text>
          {/* HRV line */}
          <path d={hrvPath} fill="none" stroke="#f59e0b" strokeWidth="2" />
          {/* Readiness line */}
          <path d={rdnPath} fill="none" stroke="#2dd4bf" strokeWidth="2" />
          {/* X labels */}
          {xLabels.map((l) => (
            <text key={l.key} x={xScale(l.key)} y={h - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="10">
              {l.label}
            </text>
          ))}
        </svg>
      </div>

      {/* Summary cards — grid layout */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-4">
        {summaries.map((s) => (
          <div
            key={s.name}
            className="rounded-lg border border-[var(--border)] px-2 py-2 text-center min-w-0"
            style={{ background: "var(--bg-card)" }}
          >
            <div className="text-xs font-medium mb-0.5 truncate">
              <span className="mr-0.5">{s.emoji}</span>{s.name}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] truncate">{s.text}</div>
            {s.label && (
              <div className="text-[10px] font-medium mt-0.5" style={{ color: s.color }}>{s.label}</div>
            )}
          </div>
        ))}
      </div>

      {/* Context line */}
      <p className="text-xs text-[var(--text-muted)] mt-3 opacity-60">
        Tracking since May 2025 · {months.length} months of data
      </p>
    </div>
  );
}

interface ChinaPrepEntry {
  date: string;
  move_learned: number | null;
  full_run: boolean;
  notes: string | null;
}

function ChinaPrepView({ entries, onSave, onDelete }: { entries: ChinaPrepEntry[]; onSave: (entry: { date: string; move_learned?: number; full_run?: boolean }) => void; onDelete: (date: string) => Promise<void> }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [moveInput, setMoveInput] = useState("");
  const [fullRunInput, setFullRunInput] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Single-month navigation: 0 = April, 1 = May
  const now = new Date();
  const defaultMonth = now.getMonth() === 4 || (now.getMonth() === 4 && now.getDate() > 21) ? 1 : now.getMonth() >= 5 ? 1 : 0;
  const [monthIndex, setMonthIndex] = useState(defaultMonth);

  const tripDate = new Date("2026-05-21T00:00:00");
  const diffMs = tripDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const todayStr = formatDateLocal(now);

  // Compute stats
  const currentMove = entries.reduce((max, e) => e.move_learned && e.move_learned > max ? e.move_learned : max, 0);
  const fullRuns = entries.filter((e) => e.full_run).length;
  const practiceDays = entries.length;

  // Entry lookup
  const entryByDate = new Map(entries.map((e) => [e.date, e]));

  // Buffer week: May 18-21
  const bufferDays = new Set(["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"]);

  // Build the two months
  const monthConfigs = [
    { label: "APRIL 2026", year: 2026, month: 3 }, // JS month 3 = April
    { label: "MAY 2026", year: 2026, month: 4 },   // JS month 4 = May
  ];

  function buildMonthDays(year: number, month: number): (string | null)[] {
    const firstOfMonth = new Date(year, month, 1);
    const startDow = firstOfMonth.getDay();
    const cells: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay = month === 4 ? 21 : daysInMonth; // May: only up to 21
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push(dateStr);
    }
    return cells;
  }

  const currentMonthConfig = monthConfigs[monthIndex];
  const monthDays = buildMonthDays(currentMonthConfig.year, currentMonthConfig.month);

  function handleDayClick(day: string) {
    const existing = entryByDate.get(day);
    setSelectedDay(day);
    if (existing) {
      setMoveInput(existing.move_learned ? String(existing.move_learned) : "");
      setFullRunInput(existing.full_run || false);
    } else {
      setMoveInput(currentMove < 24 ? String(currentMove + 1) : "");
      setFullRunInput(false);
    }
  }

  function closeModal() {
    setSelectedDay(null);
  }

  async function handleSave() {
    if (!selectedDay) return;
    setSaving(true);
    const payload: { date: string; move_learned?: number; full_run?: boolean } = { date: selectedDay };
    const mv = parseInt(moveInput, 10);
    if (!isNaN(mv) && mv > 0 && mv <= 24 && mv <= currentMove + 1) {
      payload.move_learned = mv;
    }
    payload.full_run = fullRunInput;
    await onSave(payload);
    setSaving(false);
    setSelectedDay(null);
  }

  async function handleDelete() {
    if (!selectedDay) return;
    setDeleting(true);
    await onDelete(selectedDay);
    setDeleting(false);
    setSelectedDay(null);
  }

  return (
    <div className="animate-fade-in">
      {/* Progress Header */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-5 md:p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-2xl md:text-3xl font-semibold tracking-tight">
              Move <span className="text-amber-400">{currentMove}</span> of 24
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-0.5 uppercase tracking-wider">
              Yang 24 Form
            </div>
            <div className="text-sm text-[var(--text-muted)] mt-1">
              {fullRuns} full run{fullRuns !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(currentMove / 24) * 100}%`, background: "#f59e0b" }}
          />
        </div>
        <div className="text-[10px] text-[var(--text-muted)] mt-1.5 text-right">
          {currentMove}/24 moves
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {[
          { label: "Days left", value: daysRemaining },
          { label: "Days practiced", value: practiceDays },
          { label: "Current move", value: `${currentMove}/24` },
          { label: "Full runs", value: fullRuns },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl p-3 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="text-lg md:text-xl font-semibold tabular-nums">{stat.value}</div>
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Single Month Calendar */}
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider mb-2">
          <span className="text-[var(--text-muted)]">{currentMonthConfig.label}</span>
          {monthIndex > 0 && (
            <button
              onClick={() => setMonthIndex(monthIndex - 1)}
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm px-1"
            >
              &lsaquo;
            </button>
          )}
          {monthIndex < 1 && (
            <button
              onClick={() => setMonthIndex(monthIndex + 1)}
              className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm px-1"
            >
              &rsaquo;
            </button>
          )}
        </div>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-3 md:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-[var(--text-muted)] pb-1">{d}</div>
            ))}
          </div>
          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} />;
              const entry = entryByDate.get(day);
              const isToday = day === todayStr;
              const isBuffer = bufferDays.has(day);
              const isPast = day < todayStr;
              const hasData = !!entry;

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className="relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all duration-150"
                  style={{
                    background: isBuffer
                      ? "rgba(139, 92, 246, 0.08)"
                      : hasData
                      ? "rgba(245, 158, 11, 0.06)"
                      : "transparent",
                    border: isToday
                      ? "1px solid rgba(245, 158, 11, 0.4)"
                      : hasData
                      ? "1px solid rgba(245, 158, 11, 0.15)"
                      : "1px solid var(--border)",
                    opacity: isPast && !hasData ? 0.4 : 1,
                    cursor: "pointer",
                  }}
                >
                  <span className="text-[10px] text-[var(--text-muted)] leading-none mb-0.5">
                    {parseInt(day.slice(8, 10), 10)}
                  </span>
                  {entry?.move_learned && (
                    <span className="text-amber-400 font-semibold text-[11px] leading-none">
                      {entry.move_learned}
                    </span>
                  )}
                  {entry?.full_run && (
                    <span className="text-[10px] leading-none">⭐</span>
                  )}
                  {isBuffer && day === "2026-05-18" && (
                    <span className="absolute -top-1 left-0 text-[7px] text-purple-400 font-medium">buf</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal overlay */}
      {selectedDay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 animate-fade-in"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <div className="text-base font-semibold mb-4">
              {new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </div>

            <div className="flex flex-col gap-4 mb-5">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-[var(--text-muted)]">Learn move</span>
                <input
                  type="number"
                  min={1}
                  max={Math.min(24, currentMove + 1)}
                  value={moveInput}
                  onChange={(e) => setMoveInput(e.target.value)}
                  className="w-14 rounded-lg px-2 py-1 text-center text-sm font-mono tabular-nums"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                  placeholder="#"
                />
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <button
                  onClick={() => setFullRunInput(!fullRunInput)}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs transition-colors"
                  style={{
                    background: fullRunInput ? "rgba(245, 158, 11, 0.2)" : "var(--bg)",
                    border: `1px solid ${fullRunInput ? "#f59e0b" : "var(--border)"}`,
                    color: fullRunInput ? "#f59e0b" : "var(--text-muted)",
                  }}
                >
                  {fullRunInput ? "\u2713" : ""}
                </button>
                <span className="text-[var(--text-muted)]">Full run</span>
              </label>
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: saving ? "var(--border)" : "#f59e0b",
                  color: saving ? "var(--text-muted)" : "#000",
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>

            {entryByDate.has(selectedDay) && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete entry"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [practices, setPractices] = useState<PracticeType[]>([]);
  const [logs, setLogs] = useState<PracticeLog[]>([]);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [ouraData, setOuraData] = useState<OuraData | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("7d");
  const [timeOffset, setTimeOffset] = useState(0);
  const [wotLogs, setWotLogs] = useState<WotEntry[]>([]);
  const [historyMonths, setHistoryMonths] = useState<HistoryMonth[] | null>(null);
  const [focusmateData, setFocusmateData] = useState<FocusmateData | null>(null);
  const [chinaMode, setChinaMode] = useState(false);
  const [chinaEntries, setChinaEntries] = useState<ChinaPrepEntry[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);

  // Lock body scroll when flow modal is open
  useEffect(() => {
    if (flowOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [flowOpen]);
  const [flowLogs, setFlowLogs] = useState<FlowLog[]>([]);
  const [flowDuration, setFlowDuration] = useState(20);
  const [flowRunning, setFlowRunning] = useState(false);
  const [flowSecondsLeft, setFlowSecondsLeft] = useState(20 * 60);
  const [flowSessionWaves, setFlowSessionWaves] = useState<number[]>([]);
  const [flowJustCompleted, setFlowJustCompleted] = useState(false);
  const [nighttimeLogs, setNighttimeLogs] = useState<{ practice_date: string; completed_at: string | null }[]>([]);
  const flowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flowActiveRef = useRef<{ start_time: string; duration_min: number } | null>(null);
  const flowCompletedRef = useRef(false);

  const togglePractice = useCallback(async (practiceId: string, isDone: boolean) => {
    if (!today || timeOffset !== 0) return;
    setTogglingId(practiceId);
    try {
      if (isDone) {
        await fetch("/api/log", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practice_id: practiceId, date: today }),
        });
      } else {
        await fetch("/api/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ practice_id: practiceId, date: today }),
        });
      }
      // Refetch logs
      const streakStart = new Date(today + "T12:00:00");
      streakStart.setDate(streakStart.getDate() - 60);
      const streakStartStr = formatDateLocal(streakStart);
      const { data } = await supabase
        .from("practice_log")
        .select("practice_date, practice_id")
        .gte("practice_date", streakStartStr)
        .lte("practice_date", today);
      if (data) setLogs(data);
    } finally {
      setTogglingId(null);
    }
  }, [today, timeOffset]);

  const fetchChinaData = useCallback(async () => {
    try {
      const res = await fetch("/api/china");
      if (res.ok) {
        const data = await res.json();
        setChinaEntries(data);
      }
    } catch { /* ignore */ }
  }, []);

  const handleChinaSave = useCallback(async (entry: { date: string; move_learned?: number; full_run?: boolean }) => {
    try {
      const res = await fetch("/api/china", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (res.ok) {
        await fetchChinaData();
      }
    } catch { /* ignore */ }
  }, [fetchChinaData]);

  const handleChinaDelete = useCallback(async (date: string) => {
    try {
      const res = await fetch("/api/china", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (res.ok) {
        await fetchChinaData();
      }
    } catch { /* ignore */ }
  }, [fetchChinaData]);

  const fetchFlowData = useCallback(async () => {
    try {
      const res = await fetch("/api/flow");
      if (res.ok) {
        const data = await res.json();
        setFlowLogs(data);
      }
    } catch { /* ignore */ }
  }, []);

  const handleFlowComplete = useCallback(async (durationMin: number) => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    try {
      await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, duration_min: durationMin }),
      });
      await fetchFlowData();
    } catch { /* ignore */ }
  }, [fetchFlowData]);

  // Fetch active flow from supabase and sync local state
  const fetchFlowActive = useCallback(async () => {
    try {
      const res = await fetch("/api/flow-active");
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.start_time) {
        const endMs = new Date(data.start_time).getTime() + data.duration_min * 60 * 1000;
        const remainingMs = endMs - Date.now();
        if (remainingMs > 0) {
          flowActiveRef.current = data;
          flowCompletedRef.current = false;
          setFlowDuration(data.duration_min);
          setFlowSecondsLeft(Math.round(remainingMs / 1000));
          setFlowRunning(true);
        } else {
          // Timer already expired — clean up if we haven't already
          flowActiveRef.current = null;
          setFlowRunning(false);
        }
      } else {
        // No active flow
        flowActiveRef.current = null;
        if (!flowJustCompleted) {
          setFlowRunning(false);
        }
      }
    } catch { /* ignore */ }
  }, [flowJustCompleted]);

  // Flow countdown — calculates remaining from supabase start_time
  useEffect(() => {
    if (!flowRunning) {
      if (flowIntervalRef.current) clearInterval(flowIntervalRef.current);
      return;
    }
    flowIntervalRef.current = setInterval(() => {
      const active = flowActiveRef.current;
      if (!active) {
        clearInterval(flowIntervalRef.current!);
        return;
      }
      const endMs = new Date(active.start_time).getTime() + active.duration_min * 60 * 1000;
      const remaining = Math.round((endMs - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(flowIntervalRef.current!);
        setFlowSecondsLeft(0);
        setFlowRunning(false);
        setFlowJustCompleted(true);
        setFlowOpen(true);
        // Chime — may fail if AudioContext not warmed (non-local start)
        try { playChime(); } catch { /* ignore */ }
        if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("🌊 Flow Complete!", { body: "Time for a break or another round?" });
        }
        // Idempotent completion: only log if we can delete the active row
        if (!flowCompletedRef.current) {
          flowCompletedRef.current = true;
          const dur = active.duration_min;
          fetch("/api/flow-active", { method: "DELETE" }).then(() => {
            flowActiveRef.current = null;
            handleFlowComplete(dur).then(() => {
              setFlowSessionWaves((t) => [...t, dur]);
            });
          });
        }
      } else {
        setFlowSecondsLeft(remaining);
      }
    }, 1000);
    return () => { if (flowIntervalRef.current) clearInterval(flowIntervalRef.current); };
  }, [flowRunning, handleFlowComplete]);

  // Update browser tab title with countdown when timer is running
  useEffect(() => {
    if (flowRunning) {
      const m = Math.floor(flowSecondsLeft / 60);
      const s = flowSecondsLeft % 60;
      document.title = `🌊 ${m}:${s.toString().padStart(2, "0")} — A.F.M's Practice`;
    } else {
      document.title = "A.F.M's Practice";
    }
    return () => { document.title = "A.F.M's Practice"; };
  }, [flowRunning, flowSecondsLeft]);

  const startFlow = useCallback(async () => {
    // Request notification permission on first start
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // Warm up AudioContext on user gesture so chime works when timer completes
    getAudioCtx();
    const startTime = new Date().toISOString();
    try {
      const res = await fetch("/api/flow-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: startTime, duration_min: flowDuration }),
      });
      if (res.ok) {
        const data = await res.json();
        flowActiveRef.current = { start_time: data.start_time ?? startTime, duration_min: flowDuration };
        flowCompletedRef.current = false;
        setFlowSecondsLeft(flowDuration * 60);
        setFlowRunning(true);
      }
    } catch { /* ignore */ }
  }, [flowDuration]);

  const flowAnotherRound = useCallback(async () => {
    setFlowJustCompleted(false);
    const startTime = new Date().toISOString();
    try {
      const res = await fetch("/api/flow-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: startTime, duration_min: flowDuration }),
      });
      if (res.ok) {
        const data = await res.json();
        flowActiveRef.current = { start_time: data.start_time ?? startTime, duration_min: flowDuration };
        flowCompletedRef.current = false;
        setFlowSecondsLeft(flowDuration * 60);
        setFlowRunning(true);
      }
    } catch { /* ignore */ }
  }, [flowDuration]);

  const flowDoneForNow = useCallback(() => {
    setFlowJustCompleted(false);
    setFlowSecondsLeft(flowDuration * 60);
    setFlowOpen(false);
  }, [flowDuration]);

  const stopFlow = useCallback(async () => {
    setFlowRunning(false);
    setFlowJustCompleted(false);
    flowActiveRef.current = null;
    setFlowSecondsLeft(flowDuration * 60);
    try {
      await fetch("/api/flow-active", { method: "DELETE" });
    } catch { /* ignore */ }
  }, [flowDuration]);

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
      supabase.from("practice_types").select("*").gte("sort_order", 0).order("sort_order"),
      supabase
        .from("practice_log")
        .select("practice_date, practice_id")
        .gte("practice_date", streakStartStr)
        .lte("practice_date", effectiveDate),
    ]);

    if (typesRes.data) setPractices(typesRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    setLoading(false);

    // Fetch nighttime routine completed_at timestamps (non-blocking)
    supabase
      .from("practice_log")
      .select("practice_date, completed_at")
      .eq("practice_id", "nighttime")
      .order("practice_date", { ascending: false })
      .limit(7)
      .then(({ data }) => { if (data) setNighttimeLogs(data); });

    // Fetch Oura data (non-blocking)
    fetch("/api/oura")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setOuraData(data); })
      .catch(() => {});

    // Fetch WOT logs (non-blocking)
    fetch("/api/wot")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (Array.isArray(data)) setWotLogs(data); })
      .catch(() => {});

    // Fetch historical Oura data (non-blocking)
    fetch("/api/oura-history")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.months) setHistoryMonths(data.months); })
      .catch(() => {});

    // Fetch Focusmate data (non-blocking)
    fetch("/api/focusmate")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data && !data.error) setFocusmateData(data); })
      .catch(() => {});

    // Fetch China prep data (non-blocking)
    fetchChinaData();

    // Fetch flow data (non-blocking)
    fetchFlowData();

    // Fetch active flow timer (non-blocking)
    fetchFlowActive();
  }, [fetchChinaData, fetchFlowData, fetchFlowActive]);

  useEffect(() => {
    fetchData();

    // Poll every 60s to keep iPad display fresh
    const poll = setInterval(fetchData, 60_000);

    // Realtime subscription for practice logs
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

    // Realtime subscription for flow_active (cross-device sync)
    const flowChannel = supabase
      .channel("flow_active_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flow_active" },
        () => {
          fetchFlowActive();
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
      supabase.removeChannel(flowChannel);
    };
  }, [fetchData, fetchFlowActive]);

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

  const todayFlows = flowLogs.filter((p) => p.date === today);
  const todayFlowMinutes = todayFlows.reduce((a, p) => a + p.duration_min, 0);

  return (
    <main className="max-w-[960px] mx-auto px-4 md:px-8 py-6 md:py-10 pb-12">
      {/* Flow modal */}
      <FlowTimer
        open={flowOpen}
        onClose={() => setFlowOpen(false)}
        flowLogs={flowLogs}
        duration={flowDuration}
        onDurationChange={setFlowDuration}
        running={flowRunning}
        secondsLeft={flowSecondsLeft}
        sessionWaves={flowSessionWaves}
        justCompleted={flowJustCompleted}
        onStart={startFlow}
        onStop={stopFlow}
        onSecondsLeftChange={setFlowSecondsLeft}
        onAnotherRound={flowAnotherRound}
        onDoneForNow={flowDoneForNow}
      />

      {/* Header with countdown */}
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div className="flex-1">
          <h1
            className="text-xl md:text-3xl font-semibold tracking-tight mb-0.5 md:mb-1 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => { setChinaMode(false); setTimeOffset(0); }}
          >
            A.F.M&apos;s Practice
          </h1>
          <p className="text-[var(--text-muted)] text-xs md:text-base">
            {formatDisplayDate(today)}
            {flowRunning && !flowOpen ? (
              <button
                onClick={() => { setFlowOpen(true); }}
                className="inline-flex items-center gap-1 text-xs md:text-sm font-semibold tabular-nums rounded-full px-2 py-0.5 ml-2 transition-all duration-200 hover:scale-105 active:scale-95"
                style={{
                  color: "#f59e0b",
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  cursor: "pointer",
                  animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  verticalAlign: "middle",
                }}
                title="Timer running — tap to open"
              >
                <span>🌊</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {`${String(Math.floor(flowSecondsLeft / 60)).padStart(2, "0")}:${String(flowSecondsLeft % 60).padStart(2, "0")}`}
                </span>
              </button>
            ) : (
              <button
                onClick={() => { setFlowOpen(true); }}
                className="inline-block ml-1.5 transition-all duration-200 hover:scale-110 active:scale-95"
                style={{ opacity: todayFlows.length > 0 ? 1 : 0.5, cursor: "pointer", background: "none", border: "none", verticalAlign: "middle", fontSize: "inherit", padding: 0 }}
                title="Flowdoro Timer"
              >
                🌊
              </button>
            )}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <TripCountdown inline onClick={() => { setChinaMode(!chinaMode); }} isActive={chinaMode} />
        </div>
      </div>

      {chinaMode ? (
        <ChinaPrepView entries={chinaEntries} onSave={handleChinaSave} onDelete={handleChinaDelete} />
      ) : (<>

      {/* Tonight card — only after 9 PM */}
      <TonightCard logs={logs} practices={practices} today={today} sleepData={ouraData?.sleep ?? []} />

      {/* Practice cards */}
      <div className="grid grid-cols-4 gap-2 md:gap-3 mb-8 md:mb-10">
        {practices.map((practice, i) => {
          const done = todayLogs.has(practice.id);
          const { count: streak, doneToday } = calculateStreak(practice.id, logs, today);
          return (
            <div
              key={practice.id}
              className={`animate-fade-in rounded-xl p-3 md:p-4 transition-all duration-200${timeOffset === 0 ? " cursor-pointer active:scale-95" : ""}${togglingId === practice.id ? " opacity-50" : ""}`}
              style={{
                animationDelay: `${i * 50}ms`,
                background: done ? "var(--accent-glow)" : "var(--bg-card)",
                border: `1px solid ${done ? "var(--accent)" : "var(--border)"}`,
              }}
              onClick={() => timeOffset === 0 && !togglingId && togglePractice(practice.id, done)}
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
                <div className="text-xs md:text-sm mt-1 text-[var(--text-muted)]">
                  {streak}d streak
                  <StreakBadge count={streak} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Last Night card */}
      {(() => {
        const yesterday = formatDateLocal((() => { const d = new Date(today + "T12:00:00"); d.setDate(d.getDate() - 1); return d; })());
        const now24hAgoMs = Date.now() - 24 * 60 * 60 * 1000;
        const lastNight = (ouraData?.sleep ?? [])
          .filter(s => {
            if (!s.bedtime_start || !isNighttimeSleep(s.bedtime_start) || !s.bedtime_end) return false;
            const endMs = new Date(s.bedtime_end).getTime();
            return endMs > now24hAgoMs;
          })
          .sort((a, b) => new Date(b.bedtime_end!).getTime() - new Date(a.bedtime_end!).getTime())[0] ?? null;
        const nighttimePractice = practices.find(
          (p) => p.id === "nighttime" || p.name.toLowerCase().includes("nighttime") || p.name.toLowerCase().includes("night")
        );
        const routineDone = nighttimePractice
          ? logs.some((l) => l.practice_date === yesterday && l.practice_id === nighttimePractice.id)
          : false;
        const nighttimeEntry = nighttimeLogs.find((n) => n.practice_date === yesterday);
        const routineTimeLabel = (() => {
          if (!routineDone) return "✗";
          if (nighttimeEntry?.completed_at) {
            const pt = new Date(new Date(nighttimeEntry.completed_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
            const h = pt.getHours();
            const m = pt.getMinutes();
            const ampm = h >= 12 ? "p" : "a";
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
          }
          return "✓";
        })();
        const formatIsoTime = (iso: string) => {
          const pt = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
          const h = pt.getHours();
          const m = pt.getMinutes();
          const ampm = h >= 12 ? "p" : "a";
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
        };
        const hasAsleep = !!lastNight?.bedtime_start;
        const hasWake = !!lastNight?.bedtime_end;
        const asleepIso = (() => {
          if (!lastNight?.bedtime_start) return null;
          if (lastNight.latency) {
            return new Date(new Date(lastNight.bedtime_start).getTime() + lastNight.latency * 1000).toISOString();
          }
          return lastNight.bedtime_start;
        })();
        const inBedLabel = (() => {
          if (!lastNight?.bedtime_start || !lastNight?.bedtime_end) return null;
          const startMs = new Date(lastNight.bedtime_start).getTime();
          const endMs = new Date(lastNight.bedtime_end).getTime();
          const totalMin = Math.round((endMs - startMs) / 60000);
          if (totalMin <= 0) return null;
          const h = Math.floor(totalMin / 60);
          const m = totalMin % 60;
          return `${h}h ${m}m in bed`;
        })();
        const allPresent = routineDone && hasAsleep && hasWake;
        const borderColor = allPresent ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)";
        return (
          <div
            className="rounded-xl p-3 md:p-4 mb-4 md:mb-5"
            style={{ background: "var(--bg-card)", border: `1px solid ${borderColor}` }}
          >
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">🌙 Last Night</div>
            <div className="flex items-center gap-2 text-sm md:text-base">
              <span className={routineDone ? "text-green-400" : "text-amber-400"}>
                routine {routineTimeLabel}
              </span>
              <span className="text-[var(--text-muted)]">→</span>
              <span className={hasAsleep ? "text-green-400" : "text-amber-400"}>
                asleep {asleepIso ? formatIsoTime(asleepIso) : "–"}
              </span>
              <span className="text-[var(--text-muted)]">→</span>
              <span className={hasWake ? "text-green-400" : "text-amber-400"}>
                wake {hasWake ? formatIsoTime(lastNight!.bedtime_end!) : "–"}
              </span>
              {inBedLabel ? (
                <span className="text-[var(--text-muted)]">
                  · {inBedLabel}
                </span>
              ) : null}
            </div>
          </div>
        );
      })()}

      {/* History view with time navigation */}
      {(() => {
        const rangeDays = getDaysForRange(today, viewMode, timeOffset);
        const rangeLabel = getRangeLabel(today, viewMode, timeOffset);
        const isAtPresent = timeOffset === 0;

        // HRV and sleep score lookup maps for table rows
        const hrvByDay = new Map<string, number>();
        const sleepByDay = new Map<string, number>();
        if (ouraData) {
          for (const s of ouraData.sleep) {
            if (s.average_hrv && s.average_hrv > 0) hrvByDay.set(s.day, s.average_hrv);
          }
          for (const s of ouraData.dailySleep) {
            if (s.score && s.score > 0) sleepByDay.set(s.day, s.score);
          }
        }
        // Focusmate sessions by day
        const focusByDay = new Map<string, number>();
        if (focusmateData) {
          for (const s of focusmateData.sessions) {
            if (s.completed) {
              focusByDay.set(s.date, (focusByDay.get(s.date) ?? 0) + 1);
            }
          }
        }
        const hrvVals = Array.from(hrvByDay.values());
        const hrv30dAvg = hrvVals.length > 0 ? hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length : null;

        // Month view helpers
        const monthGrid = viewMode === "month" ? (() => {
          const first = new Date(rangeDays[0] + "T12:00:00");
          const startDow = first.getDay(); // 0=Sun
          const cells: (string | null)[] = [];
          for (let i = 0; i < startDow; i++) cells.push(null);
          for (const d of rangeDays) cells.push(d);
          return cells;
        })() : [];

        return (
          <div>
            {/* Controls row */}
            <div className="flex items-center justify-between mb-3">
              {/* View mode pills */}
              <div className="flex gap-1">
                {(["7d", "14d", "month"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setViewMode(mode); setTimeOffset(0); }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: viewMode === mode ? "var(--accent)" : "var(--bg-card)",
                      color: viewMode === mode ? "#000" : "var(--text-muted)",
                      border: `1px solid ${viewMode === mode ? "var(--accent)" : "var(--border)"}`,
                    }}
                  >
                    {mode === "month" ? "Month" : mode.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimeOffset((o) => o + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
                  aria-label="Previous period"
                >
                  ‹
                </button>
                <button
                  onClick={() => setTimeOffset(0)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors min-w-[110px] text-center"
                  title="Reset to current"
                >
                  {rangeLabel}
                </button>
                <button
                  onClick={() => setTimeOffset((o) => Math.max(0, o - 1))}
                  disabled={isAtPresent}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: isAtPresent ? "var(--border)" : "var(--text-muted)",
                    cursor: isAtPresent ? "default" : "pointer",
                  }}
                  aria-label="Next period"
                >
                  ›
                </button>
              </div>
            </div>

            {/* Dot matrix table (7d / 14d) */}
            {viewMode !== "month" && (
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 md:p-5 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pb-2 pr-3" />
                      {rangeDays.map((day) => (
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
                    {/* Section header: PRACTICES */}
                    <tr>
                      <td colSpan={rangeDays.length + 1} className="pt-1 pb-2">
                        <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] opacity-60">Practices</span>
                      </td>
                    </tr>
                    {practices.map((practice) => (
                      <tr key={practice.id}>
                        <td className="pr-3 py-1.5 whitespace-nowrap">
                          <span className="text-sm md:text-base">{practice.emoji}</span>
                          <span className="hidden md:inline text-xs text-[var(--text-muted)] ml-1.5">
                            {practice.name}
                          </span>
                        </td>
                        {rangeDays.map((day) => {
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
                    {/* Section header: BODY & FOCUS */}
                    {(hrvByDay.size > 0 || sleepByDay.size > 0 || focusByDay.size > 0 || wotLogs.length > 0) && (
                      <tr>
                        <td colSpan={rangeDays.length + 1} className="pt-3 pb-2" style={{ borderTop: "1px solid var(--border)" }}>
                          <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] opacity-60">Body & Focus</span>
                        </td>
                      </tr>
                    )}
                    {/* HRV row */}
                    {hrvByDay.size > 0 && (
                      <tr>
                        <td className="pr-3 py-1.5 whitespace-nowrap">
                          <span className="text-sm md:text-base">❤️</span>
                        </td>
                        {rangeDays.map((day) => {
                          const hrv = hrvByDay.get(day);
                          let color = "var(--text-muted)";
                          if (hrv != null && hrv30dAvg != null) {
                            const diff = hrv - hrv30dAvg;
                            if (diff > 5) color = "#22c55e";
                            else if (diff < -5) color = "#eab308";
                          }
                          return (
                            <td key={day} className="text-center py-1.5 px-1">
                              <span className="text-[10px] md:text-xs font-mono tabular-nums" style={{ color }}>
                                {hrv != null ? hrv : "–"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* Sleep score row */}
                    {sleepByDay.size > 0 && (
                      <tr>
                        <td className="pr-3 py-1.5 whitespace-nowrap">
                          <span className="text-sm md:text-base">😴</span>
                        </td>
                        {rangeDays.map((day) => {
                          const score = sleepByDay.get(day);
                          let color = "var(--text-muted)";
                          if (score != null) {
                            if (score >= 80) color = "#22c55e";
                            else if (score < 60) color = "#eab308";
                          }
                          return (
                            <td key={day} className="text-center py-1.5 px-1">
                              <span className="text-[10px] md:text-xs font-mono tabular-nums" style={{ color }}>
                                {score != null ? score : "–"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* Focusmate row */}
                    {focusByDay.size > 0 && (
                      <tr>
                        <td className="pr-3 py-1.5 whitespace-nowrap">
                          <span className="text-sm md:text-base">🎯</span>
                        </td>
                        {rangeDays.map((day) => {
                          const count = focusByDay.get(day);
                          return (
                            <td key={day} className="text-center py-1.5 px-1">
                              {count ? (
                                <span className="relative inline-block">
                                  <span className="text-base">🎯</span>
                                  {count >= 1 && (
                                    <span className="absolute -top-1 -right-2 text-[9px] font-bold text-green-400">{count}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--text-muted)]">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {/* WOT row */}
                    {wotLogs.length > 0 && (
                      <tr>
                        <td className="pr-3 py-1.5 whitespace-nowrap">
                          <span className="text-sm md:text-base">🪟</span>
                          <span className="hidden md:inline text-xs text-[var(--text-muted)] ml-1.5">WOT</span>
                        </td>
                        {rangeDays.map((day) => {
                          const wot = wotLogs.find((w) => w.date === day);
                          const wotEmoji: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
                          return (
                            <td key={day} className="text-center py-1.5 px-1">
                              {wot ? (
                                <span className="text-sm" title={`WOT: ${wot.color}`}>
                                  {wotEmoji[wot.color]}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Month calendar grid */}
            {viewMode === "month" && (
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 md:p-5">
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                    <div key={d} className="text-center text-[10px] text-[var(--text-muted)] py-1">
                      {d}
                    </div>
                  ))}
                </div>
                {/* Calendar cells */}
                <div className="grid grid-cols-7 gap-1">
                  {monthGrid.map((day, i) => {
                    if (!day) {
                      return <div key={`empty-${i}`} />;
                    }
                    const dayLogs = logs.filter((l) => l.practice_date === day);
                    const doneCount = new Set(dayLogs.map((l) => l.practice_id)).size;
                    const total = practices.length;
                    const ratio = total > 0 ? doneCount / total : 0;
                    const dayNum = parseInt(day.slice(8, 10));
                    const isToday = day === today;
                    const opacity = ratio === 0 ? 0 : ratio < 0.5 ? 0.3 : ratio < 1 ? 0.6 : 1;

                    return (
                      <div
                        key={day}
                        className="relative aspect-square flex flex-col items-center justify-center rounded-lg transition-colors"
                        style={{
                          border: isToday ? "1px solid var(--accent)" : "1px solid transparent",
                        }}
                        title={doneCount > 0 ? `${doneCount}/${total} practices` : day}
                      >
                        <span className="text-[11px] md:text-xs text-[var(--text-muted)]">{dayNum}</span>
                        {doneCount > 0 && (
                          <div
                            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full mt-0.5"
                            style={{
                              background: "var(--accent)",
                              opacity,
                            }}
                          />
                        )}
                        {doneCount === 0 && (
                          <div
                            className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full mt-0.5"
                            style={{ border: "1px solid var(--border)", opacity: 0.3 }}
                          />
                        )}
                        {(() => {
                          const wot = wotLogs.find((w) => w.date === day);
                          if (!wot) return null;
                          const wotColors: Record<string, string> = { green: "#4ade80", yellow: "#fbbf24", red: "#f87171" };
                          return (
                            <div
                              className="w-[6px] h-[6px] rounded-full mt-0.5"
                              style={{ backgroundColor: wotColors[wot.color] }}
                              title={`WOT: ${wot.color}`}
                            />
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* North Star Metrics */}
      {ouraData && today && (() => {
        // Rolling 30-day windows
        const todayDate = new Date(today + "T12:00:00");
        const curr30Start = new Date(todayDate);
        curr30Start.setDate(curr30Start.getDate() - 29);
        const prev30Start = new Date(curr30Start);
        prev30Start.setDate(prev30Start.getDate() - 30);
        const prev30End = new Date(curr30Start);
        prev30End.setDate(prev30End.getDate() - 1);

        const fmt = (d: Date) => formatDateLocal(d);
        const currStart = fmt(curr30Start);
        const currEnd = fmt(todayDate);
        const prevStart = fmt(prev30Start);
        const prevEnd = fmt(prev30End);

        const inRange = <T extends { day: string }>(items: T[], start: string, end: string) =>
          items.filter((i) => i.day >= start && i.day <= end);

        // HRV
        const currHrvVals = inRange(ouraData.sleep, currStart, currEnd).map((s) => s.average_hrv).filter((v): v is number => v != null && v > 0);
        const prevHrvVals = inRange(ouraData.sleep, prevStart, prevEnd).map((s) => s.average_hrv).filter((v): v is number => v != null && v > 0);
        const avgHrv = currHrvVals.length > 0 ? currHrvVals.reduce((a, b) => a + b, 0) / currHrvVals.length : 0;
        const prevAvgHrv = prevHrvVals.length > 0 ? prevHrvVals.reduce((a, b) => a + b, 0) / prevHrvVals.length : 0;
        const hrvDelta = prevAvgHrv > 0 ? avgHrv - prevAvgHrv : null;

        // Resilience distribution (rolling 30d)
        const currRes = inRange(ouraData.resilience, currStart, currEnd);
        const prevRes = inRange(ouraData.resilience, prevStart, prevEnd);
        const currDist: Record<string, number> = {};
        for (const r of currRes) currDist[r.level] = (currDist[r.level] ?? 0) + 1;
        const prevTotal = prevRes.length;
        const prevStrongSolidPct = prevTotal > 0
          ? (prevRes.filter((r) => ["exceptional", "strong", "solid"].includes(r.level)).length / prevTotal) * 100
          : null;

        // Consistency (rolling 30d)
        const currDaysWithPractice = new Set(
          logs.filter((l) => l.practice_date >= currStart && l.practice_date <= currEnd).map((l) => l.practice_date)
        ).size;
        const prevDaysWithPractice = new Set(
          logs.filter((l) => l.practice_date >= prevStart && l.practice_date <= prevEnd).map((l) => l.practice_date)
        ).size;

        // Stress (rolling 30d)
        const currStress = inRange(ouraData.stress, currStart, currEnd);

        return (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider">
              North Star Metrics
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <HrvCard avg={avgHrv} delta={hrvDelta} />
              <BedtimeCard sleepData={ouraData.sleep} today={today} logs={logs} practices={practices} />
              <ResilienceCard distribution={currDist} prevStrongSolidPct={prevStrongSolidPct} />
              <StressBalanceCard stressData={currStress} />
            </div>
            {(() => {
              // Only count days since tracking started
              const trackStart = new Date(TRACKING_START + "T12:00:00");
              const windowStart = new Date(currStart + "T12:00:00");
              const windowEnd = new Date(currEnd + "T12:00:00");
              const effectiveStart = trackStart > windowStart ? trackStart : windowStart;
              const totalDays = effectiveStart <= windowEnd
                ? Math.round((windowEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
                : 0;
              return <ConsistencyLine days={currDaysWithPractice} totalDays={totalDays} />;
            })()}
            {(() => {
              // Sleep consistency: X/14 days with complete frame
              const longestByDay = getLongestSleepByDay(ouraData.sleep);
              const d14 = new Date(todayDate);
              d14.setDate(d14.getDate() - 13);
              let completeCount = 0;
              for (let d = new Date(d14); d <= todayDate; d.setDate(d.getDate() + 1)) {
                const dayStr = formatDateLocal(d);
                const entry = longestByDay.get(dayStr);
                if (entry) {
                  const frame = scoreSleepFrame(entry);
                  if (frame?.status === "complete") completeCount++;
                }
              }
              return (
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Sleep consistency: {completeCount}/14 days with complete frame
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* HRV Trend Chart */}
      {ouraData && <HrvChart data={ouraData.sleep} resilienceData={ouraData.resilience} />}

      {/* Patterns — practice-to-body correlations */}
      {ouraData && <PatternsSection logs={logs} ouraData={ouraData} />}

      {historyMonths && <YourYear months={historyMonths} ouraData={ouraData} />}

      </>)}
    </main>
  );
}
