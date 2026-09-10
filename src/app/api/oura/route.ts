import { NextResponse } from "next/server";
import { getCachedOuraData } from "@/lib/oura-cache";

export async function GET() {
  try {
    const data = await getCachedOuraData();
    const response = NextResponse.json(data);
    response.headers.set(
      "Cache-Control",
      "public, max-age=600, s-maxage=600"
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
