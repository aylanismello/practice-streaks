import { NextResponse } from "next/server";
import { getCachedOuraData } from "@/lib/oura-cache";

const TRACKING_START = "2025-05-03";

interface MonthBucket {
  month: string;
  hrvValues: number[];
  sleepScores: number[];
  readinessScores: number[];
  resilience: {
    exceptional: number;
    strong: number;
    solid: number;
    adequate: number;
    limited: number;
  };
  stressDays: number;
  recoveryDays: number;
  totalNights: number;
}

function getMonth(day: string): string {
  return day.slice(0, 7);
}

function resilienceKey(
  level: string
): keyof MonthBucket["resilience"] | null {
  const l = level.toLowerCase();
  if (l === "exceptional") return "exceptional";
  if (l === "strong") return "strong";
  if (l === "solid") return "solid";
  if (l === "adequate") return "adequate";
  if (l === "limited") return "limited";
  return null;
}

export async function GET() {
  try {
    const cached = await getCachedOuraData();
    const sleep = cached.sleep.filter((entry) => entry.day >= TRACKING_START);
    const readiness = cached.readiness.filter((entry) => entry.day >= TRACKING_START);
    const resilience = cached.resilience.filter((entry) => entry.day >= TRACKING_START);
    const dailySleep = cached.dailySleep.filter((entry) => entry.day >= TRACKING_START);
    const stress = cached.stress.filter((entry) => entry.day >= TRACKING_START);

    const buckets = new Map<string, MonthBucket>();

    function getBucket(month: string): MonthBucket {
      if (!buckets.has(month)) {
        buckets.set(month, {
          month,
          hrvValues: [],
          sleepScores: [],
          readinessScores: [],
          resilience: {
            exceptional: 0,
            strong: 0,
            solid: 0,
            adequate: 0,
            limited: 0,
          },
          stressDays: 0,
          recoveryDays: 0,
          totalNights: 0,
        });
      }
      return buckets.get(month)!;
    }

    const sleepByDay = new Map<string, number>();
    for (const entry of sleep) {
      if (entry.average_hrv != null && entry.average_hrv > 0) {
        sleepByDay.set(entry.day, entry.average_hrv);
      }
    }
    for (const [day, hrv] of sleepByDay) {
      const bucket = getBucket(getMonth(day));
      bucket.hrvValues.push(hrv);
      bucket.totalNights++;
    }

    for (const entry of readiness) {
      if (entry.score > 0) {
        getBucket(getMonth(entry.day)).readinessScores.push(entry.score);
      }
    }

    for (const entry of resilience) {
      const key = resilienceKey(entry.level);
      if (key) {
        getBucket(getMonth(entry.day)).resilience[key]++;
      }
    }

    for (const entry of dailySleep) {
      if (entry.score > 0) {
        getBucket(getMonth(entry.day)).sleepScores.push(entry.score);
      }
    }

    for (const entry of stress) {
      const summary = entry.day_summary?.toLowerCase() ?? "";
      const bucket = getBucket(getMonth(entry.day));
      if (summary.includes("stress")) bucket.stressDays++;
      if (summary.includes("recovery") || summary.includes("restored")) {
        bucket.recoveryDays++;
      }
    }

    const months = Array.from(buckets.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((bucket) => ({
        month: bucket.month,
        avgHrv:
          bucket.hrvValues.length > 0
            ? Math.round(
                bucket.hrvValues.reduce((sum, value) => sum + value, 0) /
                  bucket.hrvValues.length
              )
            : null,
        avgSleepScore:
          bucket.sleepScores.length > 0
            ? Math.round(
                bucket.sleepScores.reduce((sum, value) => sum + value, 0) /
                  bucket.sleepScores.length
              )
            : null,
        avgReadinessScore:
          bucket.readinessScores.length > 0
            ? Math.round(
                bucket.readinessScores.reduce((sum, value) => sum + value, 0) /
                  bucket.readinessScores.length
              )
            : null,
        resilience: bucket.resilience,
        stressBalance: {
          stressDays: bucket.stressDays,
          recoveryDays: bucket.recoveryDays,
        },
        totalNights: bucket.totalNights,
      }));

    const response = NextResponse.json({ months, syncedAt: cached.syncedAt });
    response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
