import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

const VALID_FORMS = new Set([
  "yang24",
  "chen18",
  "taichi10",
  "six_healing_sounds",
  "eight_brocades",
]);
const MAX_NOTE_LENGTH = 500;

export async function GET(req: NextRequest) {
  try {
    const form = req.nextUrl.searchParams.get("form");
    const movement = req.nextUrl.searchParams.get("movement");
    if (form && !VALID_FORMS.has(form)) {
      return NextResponse.json({ error: "invalid form" }, { status: 400 });
    }

    const supabase = createServiceClient();
    let query = supabase
      .from("tai_chi_marks")
      .select("id, form_id, movement_number, video_id, seconds, note, created_at")
      .order("seconds", { ascending: true });

    if (form) query = query.eq("form_id", form);
    if (movement) {
      const movementNumber = Number(movement);
      if (!Number.isInteger(movementNumber) || movementNumber < 1 || movementNumber > 24) {
        return NextResponse.json({ error: "invalid movement" }, { status: 400 });
      }
      query = query.eq("movement_number", movementNumber);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const formId = typeof body.form_id === "string" ? body.form_id : "";
    const movementNumber = Number(body.movement_number);
    const videoId = typeof body.video_id === "string" ? body.video_id.trim() : "";
    const seconds = Math.max(0, Math.floor(Number(body.seconds)));
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!VALID_FORMS.has(formId)) {
      return NextResponse.json({ error: "invalid form" }, { status: 400 });
    }
    if (!Number.isInteger(movementNumber) || movementNumber < 1 || movementNumber > 24) {
      return NextResponse.json({ error: "invalid movement" }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: "invalid video" }, { status: 400 });
    }
    if (!Number.isFinite(seconds)) {
      return NextResponse.json({ error: "invalid timestamp" }, { status: 400 });
    }
    if (note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `note must be at most ${MAX_NOTE_LENGTH} characters` }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tai_chi_marks")
      .insert({
        form_id: formId,
        movement_number: movementNumber,
        video_id: videoId,
        seconds,
        note,
      })
      .select("id, form_id, movement_number, video_id, seconds, note, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    const note = typeof body.note === "string" ? body.note.trim() : null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "invalid mark id" }, { status: 400 });
    }
    if (note === null || note.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `note must be at most ${MAX_NOTE_LENGTH} characters` }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tai_chi_marks")
      .update({ note })
      .eq("id", id)
      .select("id, form_id, movement_number, video_id, seconds, note, created_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "mark not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "invalid mark id" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tai_chi_marks")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "mark not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
