import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("china_move_links")
      .select("move_number, youtube_url")
      .order("move_number", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { move_number, youtube_url } = await req.json();
    if (!move_number || typeof move_number !== "number") {
      return NextResponse.json({ error: "move_number is required" }, { status: 400 });
    }
    const row: { move_number: number; youtube_url: string | null } = {
      move_number,
      youtube_url: youtube_url?.trim() ? String(youtube_url).trim() : null,
    };
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("china_move_links")
      .upsert(row, { onConflict: "move_number" })
      .select("move_number, youtube_url")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
