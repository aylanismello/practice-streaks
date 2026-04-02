import { NextResponse } from "next/server";

// Required environment variable: OURA_ACCESS_TOKEN
// Set this to your Oura Ring personal access token in Vercel env vars

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";

interface OuraSleepEntry {
  average_hrv: number;
  day: string;
  bedtime_start: string;
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

export async function GET() {
  const token = process.env.OURA_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "OURA_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const dateRange = `start_date=${startDate}&end_date=${endDate}`;

  try {
    const [sleep, readiness, resilience, dailySleep] = await Promise.all([
      fetchOura<OuraSleepEntry>(`sleep?${dateRange}`, token),
      fetchOura<OuraReadinessEntry>(`daily_readiness?${dateRange}`, token),
      fetchOura<OuraResilienceEntry>(`daily_resilience?${dateRange}`, token),
      fetchOura<OuraDailySleepEntry>(`daily_sleep?${dateRange}`, token),
    ]);

    const response = NextResponse.json({
      sleep: sleep.map((s) => ({ average_hrv: s.average_hrv, day: s.day, bedtime_start: s.bedtime_start })),
      readiness: readiness.map((r) => ({ score: r.score, day: r.day })),
      resilience: resilience.map((r) => ({ level: r.level, day: r.day })),
      dailySleep: dailySleep.map((s) => ({ score: s.score, day: s.day })),
    });

    response.headers.set(
      "Cache-Control",
      "public, max-age=3600, s-maxage=3600"
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
