import { createClient } from "@supabase/supabase-js";

const CACHE_BUCKET = "practice-streaks-cache";
const CACHE_OBJECT = "oura.json";

export interface CachedOuraData {
  sleep: {
    average_hrv: number | null;
    day: string;
    bedtime_start: string | null;
    bedtime_end: string | null;
    total_sleep_duration: number | null;
    latency: number | null;
  }[];
  readiness: { score: number; day: string }[];
  resilience: {
    level: string;
    day: string;
    contributors?: {
      sleep_recovery?: number;
      daytime_recovery?: number;
      stress?: number;
    };
  }[];
  dailySleep: { score: number; day: string }[];
  stress: {
    day: string;
    stress_high: number | null;
    recovery_high: number | null;
    day_summary: string | null;
  }[];
  syncedAt: string;
}

function assertCache(value: unknown): asserts value is CachedOuraData {
  if (!value || typeof value !== "object") {
    throw new Error("Oura cache is invalid");
  }
  const data = value as Partial<CachedOuraData>;
  for (const key of ["sleep", "readiness", "resilience", "dailySleep", "stress"] as const) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Oura cache is missing ${key}`);
    }
  }
  if (typeof data.syncedAt !== "string") {
    throw new Error("Oura cache is missing syncedAt");
  }
}

export async function getCachedOuraData(): Promise<CachedOuraData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase cache credentials are not configured");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.storage
    .from(CACHE_BUCKET)
    .download(CACHE_OBJECT);

  if (error) {
    throw new Error(`Oura cache download failed: ${error.message}`);
  }

  const payload: unknown = JSON.parse(await data.text());
  assertCache(payload);
  return payload;
}
