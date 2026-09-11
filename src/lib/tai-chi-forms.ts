export interface TaiChiLesson {
  number: number;
  label: string;
  name: string;
  youtubeUrl: string;
}

export const CHEN18_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL7dztrxiJ7iyYbAlcEBxhRXq_DpMvMW5n";

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
