import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { effectiveWotLevel, effectiveWotScore, normalizeWotScore, WOT_SCORE_TO_LEVEL } from "@/lib/wot";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("wot_log")
      .select("date, score, color, legacy_color")
      .gte("date", sinceStr)
      .order("date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data?.map((row) => ({
      ...row,
      score: effectiveWotScore(row),
      display_color: effectiveWotLevel(row),
    })));
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, score, color } = await req.json();

    if (!date || (score == null && color == null)) {
      return NextResponse.json({ error: "date and score are required" }, { status: 400 });
    }

    const normalized = normalizeWotScore(score ?? color);
    if (!normalized) {
      return NextResponse.json({ error: "invalid wot score" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("wot_log")
      .upsert({ date, score: normalized, color: WOT_SCORE_TO_LEVEL[normalized] }, { onConflict: "date" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
