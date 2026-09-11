export type TaiChiFormId = "yang24" | "chen18";

export interface TaiChiLesson {
  number: number;
  label: string;
  name: string;
  youtubeUrl: string | null;
}

export interface TaiChiMark {
  id: string;
  form_id: TaiChiFormId;
  movement_number: number;
  video_id: string;
  seconds: number;
  note: string;
  created_at: string;
}

export interface Yang24MoveLink {
  move_number: number;
  youtube_url: string | null;
}

export const YANG24_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL7dztrxiJ7iyErVqv9H2LhxfsfRqYnMSG";

export const CHEN18_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL7dztrxiJ7iyYbAlcEBxhRXq_DpMvMW5n";

const YANG24_MOVES = [
  { number: 1, name: "Commencement" },
  { number: 2, name: "Part the Wild Horse's Mane" },
  { number: 3, name: "White Crane Spreads Wings" },
  { number: 4, name: "Brush Knee and Push" },
  { number: 5, name: "Play the Lute" },
  { number: 6, name: "Step Back and Repulse Monkey" },
  { number: 7, name: "Grasp the Sparrow's Tail" },
  { number: 8, name: "Single Whip" },
  { number: 9, name: "Wave Hands Like Clouds" },
  { number: 10, name: "Single Whip" },
  { number: 11, name: "High Pat on Horse" },
  { number: 12, name: "Kick With Right Heel" },
  { number: 13, name: "Strike Ears with Both Fists" },
  { number: 14, name: "Turn Body and Left Leg Kick" },
  { number: 15, name: "Left Lower Stance" },
  { number: 16, name: "Golden Rooster Stands on One Leg" },
  { number: 17, name: "Right Lower Stance" },
  { number: 18, name: "Snake Creeps Down" },
  { number: 19, name: "Step Forward" },
  { number: 20, name: "Deflect Down" },
  { number: 21, name: "Parry and Punch" },
  { number: 22, name: "Apparent Close Up" },
  { number: 23, name: "Cross Hands" },
  { number: 24, name: "Closing Form" },
] as const;

export function buildYang24Lessons(moveLinks: readonly Yang24MoveLink[]): TaiChiLesson[] {
  const byMove = new Map(moveLinks.map((link) => [link.move_number, link.youtube_url]));
  return YANG24_MOVES
    .filter((move) => move.number !== 8)
    .map((move) => move.number === 7
      ? {
          number: 7,
          label: "7–8",
          name: "Grasp the Sparrow's Tail + Single Whip",
          youtubeUrl: byMove.get(7) ?? byMove.get(8) ?? null,
        }
      : {
          number: move.number,
          label: String(move.number),
          name: move.name,
          youtubeUrl: byMove.get(move.number) ?? null,
        });
}

export function getYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(segments[0])) return segments[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatTaiChiTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The Chen sequence is the final 18 videos in the supplied studio playlist.
// Playlist positions 23, 26, and 27 are visibly titled 9, 12, and 13,
// confirming that positions 15–32 map directly to movements 1–18.
export const CHEN18_LESSONS: readonly TaiChiLesson[] = [
  { number: 1, label: "1", name: "Preparing Form", youtubeUrl: "https://youtu.be/83IPiN0Bi7w" },
  { number: 2, label: "2", name: "Buddha's Warrior Pounds Mortar", youtubeUrl: "https://youtu.be/uCcNAYI-hws" },
  { number: 3, label: "3", name: "Lazily Tying Coat", youtubeUrl: "https://youtu.be/J01wXlO0DHk" },
  { number: 4, label: "4", name: "Six Sealings and Four Closings", youtubeUrl: "https://youtu.be/iVh-sJj42lg" },
  { number: 5, label: "5", name: "Single Whip", youtubeUrl: "https://youtu.be/_6K6gOIT4GU" },
  { number: 6, label: "6", name: "White Crane Spreads Wings", youtubeUrl: "https://youtu.be/bX-93aYKYLI" },
  { number: 7, label: "7", name: "Diagonal Posture", youtubeUrl: "https://youtu.be/31WDoPKny3E" },
  { number: 8, label: "8", name: "Brush Knee", youtubeUrl: "https://youtu.be/afjwDZjTt0Q" },
  { number: 9, label: "9", name: "Step Forward Three Times", youtubeUrl: "https://youtu.be/bP--0jW4FCk" },
  { number: 10, label: "10", name: "Hidden Hand Thrust Punch", youtubeUrl: "https://youtu.be/2icJbcxvko4" },
  { number: 11, label: "11", name: "High Pat on Horse", youtubeUrl: "https://youtu.be/d9WoNJc7rqQ" },
  { number: 12, label: "12", name: "Left Heel Kick", youtubeUrl: "https://youtu.be/7FIVkbZKDvQ" },
  { number: 13, label: "13", name: "Jade Maiden Works the Shuttle", youtubeUrl: "https://youtu.be/wia28Uscw5Q" },
  { number: 14, label: "14", name: "Cloud Hands", youtubeUrl: "https://youtu.be/MKE3B3n4ER4" },
  { number: 15, label: "15", name: "Turn Body and Double Lotus Kick", youtubeUrl: "https://youtu.be/GyE6OwoaUWM" },
  { number: 16, label: "16", name: "Double Cannon Fists", youtubeUrl: "https://youtu.be/44ZLVf9DMWo" },
  { number: 17, label: "17", name: "Buddha's Warrior Pounds Mortar", youtubeUrl: "https://youtu.be/3mnpnJ3xj7w" },
  { number: 18, label: "18", name: "Closing Form", youtubeUrl: "https://youtu.be/yyINXb8koJ0" },
];
