"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildYang24Lessons,
  CHEN18_LESSONS,
  CHEN18_PLAYLIST_URL,
  EIGHT_BROCADES_LESSONS,
  formatTaiChiTimestamp,
  getYouTubeVideoId,
  parseTaiChiFormId,
  SIX_HEALING_SOUNDS_LESSONS,
  TAI_CHI_10_LESSONS,
  type TaiChiFormId,
  type TaiChiLesson,
  type TaiChiMark,
  type Yang24MoveLink,
  YANG24_PLAYLIST_URL,
} from "@/lib/tai-chi-forms";
import { YouTubeStudyPlayer, type YouTubeStudyPlayerHandle } from "@/components/YouTubeStudyPlayer";

const FORM_META = {
  yang24: { title: "Yang 24", sourceUrl: YANG24_PLAYLIST_URL, sourceLabel: "Playlist ↗", singleVideo: false },
  chen18: { title: "Chen 18", sourceUrl: CHEN18_PLAYLIST_URL, sourceLabel: "Playlist ↗", singleVideo: false },
  taichi10: { title: "Tai Chi 10", sourceUrl: "https://youtu.be/f3m-ZImsr_M", sourceLabel: "Video ↗", singleVideo: true },
  six_healing_sounds: { title: "6 Healing Sounds Qigong", sourceUrl: "https://youtu.be/54jCN0Dq0JQ", sourceLabel: "Video ↗", singleVideo: true },
  eight_brocades: { title: "8 Brocades Qigong", sourceUrl: "https://youtu.be/8-bZxZZuZwY", sourceLabel: "Video ↗", singleVideo: true },
} as const;

const FIXED_LESSONS: Record<Exclude<TaiChiFormId, "yang24">, readonly TaiChiLesson[]> = {
  chen18: CHEN18_LESSONS,
  taichi10: TAI_CHI_10_LESSONS,
  six_healing_sounds: SIX_HEALING_SOUNDS_LESSONS,
  eight_brocades: EIGHT_BROCADES_LESSONS,
};

export function TaiChiLibrary() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const formId = parseTaiChiFormId(searchParams.get("form"));
  const [moveLinks, setMoveLinks] = useState<Yang24MoveLink[]>([]);
  const [marks, setMarks] = useState<TaiChiMark[]>([]);
  const [selectedNumber, setSelectedNumber] = useState(1);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingMarkId, setUpdatingMarkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<YouTubeStudyPlayerHandle | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/china?links=1").then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load Yang videos"))),
      fetch("/api/tai-chi-marks").then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load study marks"))),
    ])
      .then(([linksData, marksData]) => {
        setMoveLinks(Array.isArray(linksData) ? linksData : []);
        setMarks(Array.isArray(marksData) ? marksData : []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the form library"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSelectedNumber(1);
    setNoteDrafts({});
    setError(null);
  }, [formId]);

  useEffect(() => {
    function handlePlayerKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const isSeekKey = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const isPlaybackKey = event.code === "Space";
      if (!isSeekKey && !isPlaybackKey) return;
      if (isPlaybackKey && event.repeat) return;

      const target = event.target;
      if (target instanceof HTMLElement && (
        target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA"
      )) return;
      if (!playerRef.current) return;

      event.preventDefault();
      if (isPlaybackKey) playerRef.current.togglePlayback();
      else playerRef.current.seekBy(event.key === "ArrowLeft" ? -5 : 5);
    }

    window.addEventListener("keydown", handlePlayerKey);
    return () => window.removeEventListener("keydown", handlePlayerKey);
  }, []);

  const lessons = useMemo<readonly TaiChiLesson[]>(
    () => formId === "yang24" ? buildYang24Lessons(moveLinks) : FIXED_LESSONS[formId],
    [formId, moveLinks]
  );

  const selectedLesson = lessons.find((lesson) => lesson.number === selectedNumber) ?? lessons[0];
  const selectedVideoId = getYouTubeVideoId(selectedLesson?.youtubeUrl);
  const selectedMarks = marks
    .filter((mark) =>
      mark.form_id === formId &&
      mark.movement_number === selectedLesson?.number &&
      mark.video_id === selectedVideoId
    )
    .sort((a, b) => a.seconds - b.seconds || a.created_at.localeCompare(b.created_at));

  function selectForm(nextForm: TaiChiFormId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("form", nextForm);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function addMark() {
    if (!selectedLesson || !selectedVideoId) return;

    setSaving(true);
    setError(null);
    const seconds = Math.max(0, Math.floor(playerRef.current?.currentTime() ?? 0));
    try {
      const response = await fetch("/api/tai-chi-marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: formId,
          movement_number: selectedLesson.number,
          video_id: selectedVideoId,
          seconds,
          note: "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save mark");
      setMarks((current) => [...current, data]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save mark");
    } finally {
      setSaving(false);
    }
  }

  async function updateMarkNote(mark: TaiChiMark, nextNote: string) {
    const note = nextNote.trim();
    if (note === mark.note) {
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[mark.id];
        return next;
      });
      return;
    }

    setUpdatingMarkId(mark.id);
    setError(null);
    try {
      const response = await fetch("/api/tai-chi-marks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mark.id, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update note");
      setMarks((current) => current.map((item) => item.id === mark.id ? data : item));
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[mark.id];
        return next;
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update note");
    } finally {
      setUpdatingMarkId(null);
    }
  }

  async function deleteMark(id: string) {
    setError(null);
    try {
      const response = await fetch("/api/tai-chi-marks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete mark");
      setMarks((current) => current.filter((mark) => mark.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete mark");
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-[var(--text-muted)]">Loading form library…</div>;
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(FORM_META) as TaiChiFormId[]).map((id) => {
          const selected = formId === id;
          return (
            <button
              key={id}
              onClick={() => selectForm(id)}
              className="rounded-xl border px-4 py-3 text-sm font-semibold transition-colors"
              style={{
                background: selected ? "rgba(245, 158, 11, 0.12)" : "var(--bg-card)",
                borderColor: selected ? "rgba(245, 158, 11, 0.55)" : "var(--border)",
                color: selected ? "#f59e0b" : "var(--text-muted)",
              }}
            >
              {FORM_META[id].title}
            </button>
          );
        })}
      </div>

      <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{FORM_META[formId].title}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Study the practice. Mark exact moments worth revisiting.</p>
        </div>
        <a
          href={FORM_META[formId].sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text-muted)]"
        >
          {FORM_META[formId].sourceLabel}
        </a>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <div className="mb-2 px-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            {lessons.length} {lessons.length === 1 ? "video" : "lessons"}
          </div>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {lessons.map((lesson) => {
              const videoId = getYouTubeVideoId(lesson.youtubeUrl);
              const markCount = marks.filter((mark) =>
                mark.form_id === formId &&
                mark.movement_number === lesson.number &&
                mark.video_id === videoId
              ).length;
              const selected = selectedLesson?.number === lesson.number;
              return (
                <button
                  key={lesson.label}
                  type="button"
                  disabled={!videoId}
                  onClick={() => { setSelectedNumber(lesson.number); setNoteDrafts({}); setError(null); }}
                  className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-35"
                  style={{
                    background: selected ? "rgba(245, 158, 11, 0.1)" : "var(--bg)",
                    borderColor: selected ? "rgba(245, 158, 11, 0.5)" : "var(--border)",
                  }}
                >
                  <span className="w-8 shrink-0 text-center font-mono text-xs font-semibold text-amber-400">{lesson.label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{lesson.name}</span>
                  {markCount > 0 && (
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">{markCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-amber-400">
                  {FORM_META[formId].singleVideo ? "Full practice" : `Movement ${selectedLesson?.label}`}
                </div>
                <h2 className="text-lg font-semibold">{selectedLesson?.name}</h2>
              </div>
              {selectedLesson?.youtubeUrl && (
                <a href={selectedLesson.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--text-muted)]">YouTube ↗</a>
              )}
            </div>

            {selectedVideoId ? (
              <YouTubeStudyPlayer ref={playerRef} videoId={selectedVideoId} />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl bg-[var(--bg)] text-sm text-[var(--text-muted)]">
                No video linked yet.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
            <div className="mb-3">
              <h3 className="font-semibold">Study marks</h3>
              <p className="text-xs text-[var(--text-muted)]">Tap once to mark the current time. Add or edit notes afterward.</p>
            </div>

            <button
              type="button"
              onClick={addMark}
              disabled={saving || !selectedVideoId}
              className="mb-4 w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Marking…" : "Mark current time"}
            </button>

            {error && <div className="mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">{error}</div>}

            {selectedMarks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center text-xs text-[var(--text-muted)]">
                No marks yet for this video.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedMarks.map((mark) => (
                  <div key={mark.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2">
                    <button
                      type="button"
                      onClick={() => playerRef.current?.seekTo(mark.seconds)}
                      className="shrink-0 rounded-md bg-amber-400/15 px-2.5 py-1.5 font-mono text-xs font-semibold text-amber-400"
                      title="Jump to this mark"
                    >
                      ▶ {formatTaiChiTimestamp(mark.seconds)}
                    </button>
                    <input
                      value={noteDrafts[mark.id] ?? mark.note}
                      onChange={(event) => setNoteDrafts((current) => ({ ...current, [mark.id]: event.target.value }))}
                      onBlur={(event) => updateMarkNote(mark, event.currentTarget.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      disabled={updatingMarkId === mark.id}
                      maxLength={500}
                      placeholder="Add a note…"
                      aria-label={`Note for mark at ${formatTaiChiTimestamp(mark.seconds)}`}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-amber-400/40 focus:bg-[var(--bg-card)] disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => deleteMark(mark.id)}
                      className="shrink-0 px-2 py-1 text-xs text-[var(--text-muted)] hover:text-red-400"
                      aria-label={`Delete mark at ${formatTaiChiTimestamp(mark.seconds)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
