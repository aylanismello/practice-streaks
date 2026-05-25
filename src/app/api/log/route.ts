import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { resolvePracticeDate } from "@/lib/dates";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { practice_id } = body;
    const date = resolvePracticeDate(body);

    if (!practice_id) {
      return NextResponse.json(
        { error: "practice_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("practice_log")
      .upsert(
        { practice_date: date, practice_id },
        { onConflict: "practice_date,practice_id" }
      )
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

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { practice_id } = body;
    const date = resolvePracticeDate(body);

    if (!practice_id) {
      return NextResponse.json(
        { error: "practice_id is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("practice_log")
      .delete()
      .eq("practice_date", date)
      .eq("practice_id", practice_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
