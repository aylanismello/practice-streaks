import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("flow_active")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { start_time, duration_min } = await req.json();

    if (!start_time || !duration_min) {
      return NextResponse.json({ error: "start_time and duration_min are required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // Delete all existing rows first
    await supabase.from("flow_active").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const { data, error } = await supabase
      .from("flow_active")
      .insert({ start_time, duration_min })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    const supabase = createServiceClient();
    await supabase.from("flow_active").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
