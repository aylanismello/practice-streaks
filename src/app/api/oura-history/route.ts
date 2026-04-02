import { NextResponse } from "next/server";

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
const TRACKING_START = "2025-05-03";

interface OuraSleepEntry {
  average_hrv: number | null;
  day: string;
}

interface OuraReadinessEntry {
  score: number;
  day: string;
}

interface OuraResilienceEntry {
  level: string;
  day: string;
}

interface OuraDailySleepEntry {
  score: number;
  day: string;
}

interface OuraStressEntry {
  day: string;
  day_summary: string | null;
}

interface MonthBucket {
  month: string;
  hrvValues: number[];
  sleepScores: number[];
  readinessScores: number[];
  resilience: { exceptional: number; strong: number; solid: number; adequate: number; limited: number };
  stressDays: number;
  recoveryDays: number;
  totalNights: number;
}

async function fetchOura<T>(path: string, token: string): Promise<T[]> {
  const res = await fetch(`${OURA_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Oura API error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.data ?? [];
}

function getMonth(day: string): string {
  return day.slice(0, 7); // "YYYY-MM"
}

function resilienceKey(level: string): keyof MonthBucket["resilience"] | null {
  const l = level.toLowerCase();
  if (l === "exceptional") return "exceptional";
  if (l === "strong") return "strong";
  if (l === "solid") return "solid";
  if (l === "adequate") return "adequate";
  if (l === "limited") return "limited";
  return null;
}

export async function GET() {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "OURA_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const dateRange = `start_date=${TRACKING_START}&end_date=${endDate}`;

  try {
    const [sleep, readiness, resilience, dailySleep, stress] = await Promise.all([
      fetchOura<OuraSleepEntry>(`sleep?${dateRange}`, token),
      fetchOura<OuraReadinessEntry>(`daily_readiness?${dateRange}`, token),
      fetchOura<OuraResilienceEntry>(`daily_resilience?${dateRange}`, token),
      fetchOura<OuraDailySleepEntry>(`daily_sleep?${dateRange}`, token),
      fetchOura<OuraStressEntry>(`daily_stress?${dateRange}`, token),
    ]);

    // Build month buckets
    const buckets = new Map<string, MonthBucket>();

    function getBucket(month: string): MonthBucket {
      if (!buckets.has(month)) {
        buckets.set(month, {
          month,
          hrvValues: [],
          sleepScores: [],
          readinessScores: [],
          resilience: { exceptional: 0, strong: 0, solid: 0, adequate: 0, limited: 0 },
          stressDays: 0,
          recoveryDays: 0,
          totalNights: 0,
        });
      }
      return buckets.get(month)!;
    }

    // Deduplicate sleep by day (take last entry per day for HRV)
    const sleepByDay = new Map<string, number>();
    for (const s of sleep) {
      if (s.average_hrv != null && s.average_hrv > 0) {
        sleepByDay.set(s.day, s.average_hrv);
      }
    }
    for (const [day, hrv] of sleepByDay) {
      const b = getBucket(getMonth(day));
      b.hrvValues.push(hrv);
      b.totalNights++;
    }

    for (const r of readiness) {
      if (r.score > 0) {
        getBucket(getMonth(r.day)).readinessScores.push(r.score);
      }
    }

    for (const r of resilience) {
      const key = resilienceKey(r.level);
      if (key) {
        getBucket(getMonth(r.day)).resilience[key]++;
      }
    }

    for (const s of dailySleep) {
      if (s.score > 0) {
        getBucket(getMonth(s.day)).sleepScores.push(s.score);
      }
    }

    for (const s of stress) {
      const summary = s.day_summary?.toLowerCase() ?? "";
      const b = getBucket(getMonth(s.day));
      if (summary.includes("stress")) b.stressDays++;
      if (summary.includes("recovery") || summary.includes("restored")) b.recoveryDays++;
    }

    // Sort by month and compute averages
    const months = Array.from(buckets.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((b) => ({
        month: b.month,
        avgHrv: b.hrvValues.length > 0 ? Math.round(b.hrvValues.reduce((a, v) => a + v, 0) / b.hrvValues.length) : null,
        avgSleepScore: b.sleepScores.length > 0 ? Math.round(b.sleepScores.reduce((a, v) => a + v, 0) / b.sleepScores.length) : null,
        avgReadinessScore: b.readinessScores.length > 0 ? Math.round(b.readinessScores.reduce((a, v) => a + v, 0) / b.readinessScores.length) : null,
        resilience: b.resilience,
        stressBalance: { stressDays: b.stressDays, recoveryDays: b.recoveryDays },
        totalNights: b.totalNights,
      }));

    const response = NextResponse.json({ months });
    response.headers.set("Cache-Control", "public, max-age=86400");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
