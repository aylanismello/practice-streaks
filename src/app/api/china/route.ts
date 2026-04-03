import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("china_prep")
      .select("date, move_learned, full_run, notes")
      .order("date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { date, move_learned, full_run, notes } = await req.json();

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    const row: Record<string, unknown> = { date };
    if (move_learned !== undefined) row.move_learned = move_learned;
    if (full_run !== undefined) row.full_run = full_run;
    if (notes !== undefined) row.notes = notes;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("china_prep")
      .upsert(row, { onConflict: "date" })
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
