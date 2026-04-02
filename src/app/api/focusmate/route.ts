import { NextResponse } from "next/server";

const FOCUSMATE_BASE = "https://api.focusmate.com/v1";
const USER_ID = "f1f1d1a5-0c0e-481b-8224-a918430a3025";

interface FocusmateSessionUser {
  completed: boolean;
  joinedAt: string;
  sessionTitle: string;
  userId: string;
}

interface FocusmateSession {
  duration: number;
  startTime: string;
  users: FocusmateSessionUser[];
}

interface FocusmateProfile {
  totalSessionCount: number;
  memberSince: string;
}

export async function GET(request: Request) {
  const apiKey = process.env.FOCUSMATE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FOCUSMATE_API_KEY not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const headers = { "X-API-Key": apiKey };

  try {
    const [sessionsRes, profileRes] = await Promise.all([
      fetch(
        `${FOCUSMATE_BASE}/sessions?start=${start.toISOString()}&end=${end.toISOString()}`,
        { headers }
      ),
      fetch(`${FOCUSMATE_BASE}/me`, { headers }),
    ]);

    if (!sessionsRes.ok) {
      throw new Error(`Focusmate sessions API: ${sessionsRes.status}`);
    }
    if (!profileRes.ok) {
      throw new Error(`Focusmate profile API: ${profileRes.status}`);
    }

    const sessionsJson = await sessionsRes.json();
    const profileJson = await profileRes.json();

    const sessions: FocusmateSession[] = sessionsJson.sessions ?? [];

    // Filter to AFM's user data and flatten
    const mapped = sessions.map((s) => {
      const me = s.users.find((u) => u.userId === USER_ID);
      return {
        startTime: s.startTime,
        duration: s.duration,
        completed: me?.completed ?? false,
      };
    });

    const profile: FocusmateProfile = profileJson.user ?? profileJson;

    const response = NextResponse.json({
      sessions: mapped,
      profile: {
        totalSessionCount: profile.totalSessionCount,
        memberSince: profile.memberSince,
      },
    });

    response.headers.set(
      "Cache-Control",
      "public, max-age=300, s-maxage=300"
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
