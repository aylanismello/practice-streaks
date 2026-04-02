import { NextResponse } from "next/server";

const FOCUSMATE_BASE = "https://api.focusmate.com/v1";
const USER_ID = "f1f1d1a5-0c0e-481b-8224-a918430a3025";

// TODO: remove hardcoded fallback once env var is confirmed on Vercel
const FALLBACK_API_KEY = "f89ac96eeb4c4dfba1ea2ff20911a00d";

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

export async function GET() {
  const apiKey = process.env.FOCUSMATE_API_KEY || FALLBACK_API_KEY;

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);

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

    // Convert to simplified shape with Pacific timezone dates and duration in minutes
    const TZ = "America/Los_Angeles";
    const mapped = sessions.map((s) => {
      const me = s.users.find((u) => u.userId === USER_ID);
      const st = new Date(s.startTime);
      const datePT = st.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
      return {
        date: datePT,
        duration: Math.round(s.duration / 60000),
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
      "public, max-age=3600, s-maxage=3600"
    );

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
