import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();

    let { data, error } = await supabase
      .from("china_prep")
      .select("date, move_learned, full_run, notes, youtube_url")
      .order("date", { ascending: true });

    if (error?.message?.includes("youtube_url")) {
      const fallback = await supabase
        .from("china_prep")
        .select("date, move_learned, full_run, notes")
        .order("date", { ascending: true });
      data = (fallback.data ?? []).map((row) => ({ ...row, youtube_url: null }));
      error = fallback.error;
    }

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
    const { date, move_learned, full_run, notes, youtube_url } = await req.json();

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    const baseRow: Record<string, unknown> = { date };
    if (move_learned !== undefined) baseRow.move_learned = move_learned;
    if (full_run !== undefined) baseRow.full_run = full_run;
    if (notes !== undefined) baseRow.notes = notes;

    const supabase = createServiceClient();

    const withYoutube = {
      ...baseRow,
      ...(youtube_url !== undefined ? { youtube_url: youtube_url?.trim() ? String(youtube_url).trim() : null } : {}),
    };

    let { data, error } = await supabase
      .from("china_prep")
      .upsert(withYoutube, { onConflict: "date" })
      .select()
      .single();

    if (error?.message?.includes("youtube_url")) {
      const fallback = await supabase
        .from("china_prep")
        .upsert(baseRow, { onConflict: "date" })
        .select()
        .single();
      data = fallback.data ? { ...fallback.data, youtube_url: null } : null;
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { date } = await req.json();

    if (!date) {
      return NextResponse.json(
        { error: "date is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("china_prep")
      .delete()
      .eq("date", date);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
