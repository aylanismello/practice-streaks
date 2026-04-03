import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("china_taichi_log")
      .select("id, practice_date, move_number, note, created_at")
      .order("practice_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { practice_date, move_number, note } = await req.json();

    if (!practice_date) {
      return NextResponse.json(
        { error: "practice_date is required" },
        { status: 400 }
      );
    }

    if (move_number != null && (move_number < 1 || move_number > 24)) {
      return NextResponse.json(
        { error: "move_number must be 1-24 or null (full run)" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("china_taichi_log")
      .insert({
        practice_date,
        move_number: move_number ?? null,
        note: note || null,
      })
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
