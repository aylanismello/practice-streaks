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
      const [prepFallback, linkRows] = await Promise.all([
        supabase
          .from("china_prep")
          .select("date, move_learned, full_run, notes")
          .order("date", { ascending: true }),
        supabase
          .from("china_move_links")
          .select("move_number, youtube_url"),
      ]);
      const linkMap = new Map((linkRows.data ?? []).map((row) => [row.move_number, row.youtube_url]));
      data = (prepFallback.data ?? []).map((row) => ({
        ...row,
        youtube_url: row.move_learned ? (linkMap.get(row.move_learned) ?? null) : null,
      }));
      error = prepFallback.error ?? linkRows.error;
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

    let { data, error } = await supabase
      .from("china_prep")
      .upsert(baseRow, { onConflict: "date" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const effectiveMoveNumber = typeof move_learned === "number"
      ? move_learned
      : typeof data?.move_learned === "number"
      ? data.move_learned
      : null;

    if (youtube_url !== undefined && effectiveMoveNumber) {
      const linkRow = {
        move_number: effectiveMoveNumber,
        youtube_url: youtube_url?.trim() ? String(youtube_url).trim() : null,
      };
      const linkResult = await supabase
        .from("china_move_links")
        .upsert(linkRow, { onConflict: "move_number" })
        .select("move_number, youtube_url")
        .single();
      if (linkResult.error) {
        return NextResponse.json({ error: linkResult.error.message }, { status: 500 });
      }
      data = { ...data, youtube_url: linkResult.data?.youtube_url ?? null };
    } else {
      data = { ...data, youtube_url: null };
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
