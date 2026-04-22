"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Phase =
  | { kind: "intro"; remaining: number }
  | { kind: "block"; blockIndex: number; remaining: number; elapsedInBlock: number }
  | { kind: "rest"; blockIndex: number; remaining: number }
  | { kind: "done" };

type BlockSetting = {
  label: string;
  halfwayAlert: boolean;
};

type Settings = {
  introTime: number;
  blockTime: number;
  intervalTime: number;
  restTime: number;
  blockCount: number;
  blocks: BlockSetting[];
};

type TimerConfigRow = {
  id: string;
  name: string;
  config: Settings;
  created_at: string;
  updated_at: string;
};

function buildBlocks(count: number, existing: BlockSetting[] = []) {
  return Array.from({ length: count }, (_, index) => existing[index] ?? { label: `Block ${index + 1}`, halfwayAlert: false });
}

const defaultSettings: Settings = {
  introTime: 10,
  blockTime: 60,
  intervalTime: 30,
  restTime: 20,
  blockCount: 3,
  blocks: buildBlocks(3),
};

function clampInt(value: string, fallback: number, min = 0, max = 999) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatTime(total: number) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  const base = input ?? {};
  const blockCount = Math.max(1, Number.isFinite(base.blockCount) ? Math.floor(base.blockCount ?? 3) : 3);
  return {
    introTime: Math.max(0, Math.floor(base.introTime ?? defaultSettings.introTime)),
    blockTime: Math.max(0, Math.floor(base.blockTime ?? defaultSettings.blockTime)),
    intervalTime: Math.max(0, Math.floor(base.intervalTime ?? defaultSettings.intervalTime)),
    restTime: Math.max(0, Math.floor(base.restTime ?? defaultSettings.restTime)),
    blockCount,
    blocks: buildBlocks(blockCount, Array.isArray(base.blocks) ? base.blocks : []),
  };
}

function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const ensureCtx = async () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      await ctxRef.current.resume();
    }
    return ctxRef.current;
  };

  const beep = async (freq: number, durationMs: number, gain = 0.08, type: OscillatorType = "sine") => {
    const ctx = await ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0.0001;
    osc.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  };

  const cue = async (kind: "intro" | "block" | "interval" | "rest" | "done") => {
    await ensureCtx();
    if (kind === "intro") {
      await beep(660, 140, 0.06);
      setTimeout(() => beep(880, 140, 0.06), 180);
      return;
    }
    if (kind === "block") {
      await beep(880, 180, 0.08, "triangle");
      setTimeout(() => beep(1100, 120, 0.06, "triangle"), 170);
      return;
    }
    if (kind === "interval") {
      await beep(520, 110, 0.05);
      setTimeout(() => beep(520, 110, 0.05), 170);
      return;
    }
    if (kind === "rest") {
      await beep(330, 220, 0.08, "sine");
      setTimeout(() => beep(262, 220, 0.08, "sine"), 240);
      return;
    }
    await beep(784, 160, 0.08);
    setTimeout(() => beep(988, 160, 0.08), 190);
    setTimeout(() => beep(1175, 180, 0.08), 390);
  };

  return { cue };
}

export default function SoMiPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "intro", remaining: defaultSettings.introTime });
  const [expandedBlocks, setExpandedBlocks] = useState<number[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cueMessage, setCueMessage] = useState("Ready to roll");
  const [configName, setConfigName] = useState("");
  const [configRows, setConfigRows] = useState<TimerConfigRow[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [configStatus, setConfigStatus] = useState("No saved config selected");
  const lastCueRef = useRef<string | null>(null);
  const halfwayCueRef = useRef<string | null>(null);
  const { cue } = useAudio();

  const totalSeconds = useMemo(() => settings.introTime + settings.blockCount * settings.blockTime + Math.max(0, settings.blockCount - 1) * settings.restTime, [settings.blockCount, settings.introTime, settings.blockTime, settings.restTime]);

  const progress = useMemo(() => {
    if (!running && !startedAt) return 0;
    if (phase.kind === "done") return 1;
    return Math.min(1, sessionSeconds / Math.max(1, totalSeconds));
  }, [phase.kind, running, sessionSeconds, startedAt, totalSeconds]);

  const phaseLabel = useMemo(() => {
    if (phase.kind === "intro") return "Intro";
    if (phase.kind === "block") return `${settings.blocks[phase.blockIndex - 1]?.label ?? `Block ${phase.blockIndex}`}`;
    if (phase.kind === "rest") return `Rest after block ${phase.blockIndex}`;
    return "Complete";
  }, [phase, settings.blocks]);

  const phaseTone = phase.kind === "intro" ? "bg-slate-900 text-cyan-300 border-cyan-400/30"
    : phase.kind === "block" ? "bg-emerald-950 text-emerald-200 border-emerald-400/30"
    : phase.kind === "rest" ? "bg-amber-950 text-amber-200 border-amber-400/30"
    : "bg-violet-950 text-violet-200 border-violet-400/30";

  useEffect(() => {
    setSettings((s) => ({ ...s, blocks: buildBlocks(s.blockCount, s.blocks) }));
  }, [settings.blockCount]);

  useEffect(() => {
    void fetch("/api/somi-configs").then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        setConfigRows(data as TimerConfigRow[]);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const tick = window.setInterval(() => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      setSessionSeconds(elapsed);

      const introEnd = settings.introTime;
      if (elapsed < introEnd) {
        const remaining = introEnd - elapsed;
        setPhase((prev) => prev.kind === "intro" && prev.remaining === remaining ? prev : { kind: "intro", remaining });
        return;
      }

      let remainingElapsed = elapsed - introEnd;
      for (let i = 1; i <= settings.blockCount; i++) {
        if (remainingElapsed < settings.blockTime) {
          const remaining = settings.blockTime - remainingElapsed;
          setPhase((prev) => prev.kind === "block" && prev.blockIndex === i && prev.remaining === remaining ? prev : { kind: "block", blockIndex: i, remaining, elapsedInBlock: settings.blockTime - remaining });
          return;
        }
        remainingElapsed -= settings.blockTime;
        if (i < settings.blockCount) {
          if (remainingElapsed < settings.restTime) {
            const remaining = settings.restTime - remainingElapsed;
            setPhase((prev) => prev.kind === "rest" && prev.blockIndex === i && prev.remaining === remaining ? prev : { kind: "rest", blockIndex: i, remaining });
            return;
          }
          remainingElapsed -= settings.restTime;
        }
      }

      setRunning(false);
      setEndedAt(Date.now());
      setPhase({ kind: "done" });
      if (audioEnabled && lastCueRef.current !== "done") {
        lastCueRef.current = "done";
        void cue("done");
        setCueMessage("Session complete");
      }
    }, 250);

    return () => window.clearInterval(tick);
  }, [audioEnabled, cue, running, startedAt, settings.blockCount, settings.blockTime, settings.introTime, settings.restTime]);

  useEffect(() => {
    if (!running) return;
    const signature = phase.kind === "intro"
      ? `intro:${phase.remaining}`
      : phase.kind === "block"
        ? `block:${phase.blockIndex}:${phase.remaining}`
        : phase.kind === "rest"
          ? `rest:${phase.blockIndex}:${phase.remaining}`
          : "done";

    if (lastCueRef.current === signature) return;
    lastCueRef.current = signature;

    if (!audioEnabled) return;
    if (phase.kind === "intro" && phase.remaining === settings.introTime) {
      setCueMessage("Intro starting");
      void cue("intro");
      return;
    }
    if (phase.kind === "block") {
      if (phase.remaining === settings.blockTime) {
        setCueMessage(`Block ${phase.blockIndex} started`);
        void cue("block");
        return;
      }
      if (settings.intervalTime > 0 && phase.remaining === settings.intervalTime) {
        setCueMessage(`Block ${phase.blockIndex} interval cue`);
        void cue("interval");
      }
      const block = settings.blocks[phase.blockIndex - 1];
      const halfwayTime = Math.max(1, Math.floor(settings.blockTime / 2));
      const halfwaySignature = `halfway:${phase.blockIndex}`;
      if (block?.halfwayAlert && phase.elapsedInBlock >= halfwayTime && halfwayCueRef.current !== halfwaySignature) {
        halfwayCueRef.current = halfwaySignature;
        setCueMessage(`${block.label} halfway alert`);
        void cue("interval");
      }
      return;
    }
    if (phase.kind === "rest" && phase.remaining === settings.restTime) {
      setCueMessage(`Rest after block ${phase.blockIndex}`);
      void cue("rest");
    }
  }, [audioEnabled, cue, phase, running, settings.blockCount, settings.blockTime, settings.blocks, settings.intervalTime, settings.introTime, settings.restTime]);

  const loadConfig = (row: TimerConfigRow) => {
    setSettings(normalizeSettings(row.config));
    setSelectedConfigId(row.id);
    setConfigName(row.name);
    setConfigStatus(`Loaded ${row.name}`);
    setExpandedBlocks([]);
  };

  const saveConfig = async () => {
    const name = configName.trim();
    if (!name) {
      setConfigStatus("Name the config first");
      return;
    }
    const res = await fetch("/api/somi-configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, config: settings }),
    });
    const data = await res.json();
    if (!res.ok) {
      setConfigStatus(data.error ?? "Save failed");
      return;
    }
    const saved = data.data as TimerConfigRow;
    setConfigRows((rows) => [saved, ...rows.filter((row) => row.id !== saved.id && row.name !== saved.name)]);
    setSelectedConfigId(saved.id);
    setConfigStatus(`Saved ${saved.name}`);
  };

  const start = async () => {
    lastCueRef.current = null;
    halfwayCueRef.current = null;
    setSessionSeconds(0);
    setEndedAt(null);
    setStartedAt(Date.now());
    setPhase({ kind: "intro", remaining: settings.introTime });
    setRunning(true);
    setCueMessage("Session armed");
  };

  const stop = () => {
    setRunning(false);
    setEndedAt(Date.now());
    setCueMessage("Stopped");
  };

  const reset = () => {
    setRunning(false);
    setStartedAt(null);
    setEndedAt(null);
    setSessionSeconds(0);
    setPhase({ kind: "intro", remaining: settings.introTime });
    setCueMessage("Ready to roll");
    lastCueRef.current = null;
    halfwayCueRef.current = null;
  };

  const elapsedLabel = formatTime(sessionSeconds);
  const remainingLabel = phase.kind === "done" ? "00:00" : formatTime(phase.remaining);

  return (
    <main className="min-h-screen px-4 py-4 md:px-8 md:py-8" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">← home</Link>
          <div className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">SoMi++ batch timer</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <section className="rounded-3xl border p-4 md:p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Settings</div>
                <div className="text-xs text-[var(--text-muted)]">Locked to one long take</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <input type="checkbox" checked={audioEnabled} onChange={(e) => setAudioEnabled(e.target.checked)} />
                audio cues
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <div className="grid grid-cols-1 gap-2">
                <input value={configName} onChange={(e) => setConfigName(e.target.value)} placeholder="Config name" className="w-full rounded-xl border bg-transparent px-3 py-2 outline-none" style={{ borderColor: "var(--border)" }} />
                <div className="flex gap-2">
                  <button onClick={saveConfig} className="rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "currentColor" }}>Save</button>
                  <select value={selectedConfigId} onChange={(e) => { const row = configRows.find((item) => item.id === e.target.value); if (row) loadConfig(row); }} className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: "var(--border)" }}>
                    <option value="">Saved configs</option>
                    {configRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </div>
                <div className="text-xs text-[var(--text-muted)]">{configStatus}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[["intro time", settings.introTime], ["block time", settings.blockTime], ["interval time", settings.intervalTime], ["rest time", settings.restTime], ["number of blocks", settings.blockCount]].map(([label, value]) => (
                <label key={label as string} className="space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
                  <input
                    type="number"
                    min={0}
                    value={value as number}
                    onChange={(e) => setSettings((s) => {
                      const nextValue = clampInt(e.target.value, value as number, label === "number of blocks" ? 1 : 0, 999);
                      if (label === "number of blocks") {
                        return { ...s, blockCount: nextValue, blocks: buildBlocks(nextValue, s.blocks) };
                      }
                      const key = label === "intro time" ? "introTime" : label === "block time" ? "blockTime" : label === "interval time" ? "intervalTime" : "restTime";
                      return { ...s, [key]: nextValue };
                    })}
                    className="w-full rounded-xl border bg-transparent px-3 py-2 outline-none"
                    style={{ borderColor: "var(--border)" }}
                  />
                </label>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Block breakdown</div>
                  <div className="text-xs text-[var(--text-muted)]">Toggle halfway alerts per block</div>
                </div>
                <div className="text-xs text-[var(--text-muted)]">{settings.blockCount} blocks</div>
              </div>
              <div className="space-y-2">
                {settings.blocks.map((block, index) => {
                  const open = expandedBlocks.includes(index);
                  return (
                    <div key={index} className="rounded-xl border" style={{ borderColor: "var(--border)" }}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left" onClick={() => setExpandedBlocks((current) => current.includes(index) ? current.filter((i) => i !== index) : [...current, index])}>
                        <div>
                          <div className="font-medium">{block.label}</div>
                          <div className="text-xs text-[var(--text-muted)]">Halfway alert {block.halfwayAlert ? "on" : "off"}</div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{open ? "collapse" : "expand"}</div>
                      </button>
                      {open && (
                        <div className="space-y-3 border-t px-3 py-3" style={{ borderColor: "var(--border)" }}>
                          <label className="block space-y-1 text-sm">
                            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Block label</div>
                            <input
                              type="text"
                              value={block.label}
                              onChange={(e) => setSettings((s) => ({
                                ...s,
                                blocks: s.blocks.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item),
                              }))}
                              className="w-full rounded-xl border bg-transparent px-3 py-2 outline-none"
                              style={{ borderColor: "var(--border)" }}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={block.halfwayAlert}
                              onChange={(e) => setSettings((s) => ({
                                ...s,
                                blocks: s.blocks.map((item, itemIndex) => itemIndex === index ? { ...item, halfwayAlert: e.target.checked } : item),
                              }))}
                            />
                            has halfway alert?
                          </label>
                          <div className="text-xs text-[var(--text-muted)]">Halfway is derived from half the block duration.</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
              <div className="flex items-center justify-between text-[var(--text-muted)]">
                <span>Total session</span>
                <span className="tabular-nums">{formatTime(totalSeconds)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[var(--text-muted)]">
                <span>Cue note</span>
                <span>{cueMessage}</span>
              </div>
            </div>
          </section>

          <section className={`rounded-3xl border p-4 md:p-6 ${phaseTone}`} style={{ borderColor: "currentColor" }}>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.35em] opacity-70">Current phase</div>
                  <div className="mt-1 text-2xl md:text-4xl font-semibold">{phaseLabel}</div>
                </div>
                <div className="text-right text-xs opacity-80">
                  <div>elapsed</div>
                  <div className="text-xl md:text-2xl font-semibold tabular-nums">{elapsedLabel}</div>
                </div>
              </div>

              <div className="rounded-[2rem] border bg-black/20 p-5 md:p-8 text-center shadow-2xl backdrop-blur-sm" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                <div className="text-[10px] uppercase tracking-[0.45em] opacity-70">{running ? "countdown" : "ready"}</div>
                <div className="mt-2 text-[clamp(4rem,16vw,11rem)] font-black leading-none tabular-nums">{remainingLabel}</div>
                <div className="mt-3 text-sm md:text-lg opacity-80">
                  {phase.kind === "intro"
                    ? "Get framed, breathe, then roll on cue."
                    : phase.kind === "block"
                      ? `Keep going. ${settings.blocks[phase.blockIndex - 1]?.label ?? `Block ${phase.blockIndex}`}.`
                      : phase.kind === "rest"
                        ? "Rest, reset, then go again."
                        : "All blocks complete."}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="intro" value={formatTime(settings.introTime)} />
                <Stat label="block" value={formatTime(settings.blockTime)} />
                <Stat label="rest" value={formatTime(settings.restTime)} />
                <Stat label="blocks" value={`${settings.blockCount}`} />
              </div>

              <div className="h-4 overflow-hidden rounded-full bg-black/20">
                <div className="h-full rounded-full bg-white/80 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={start} disabled={running} className="rounded-full px-6 py-3 font-semibold text-black disabled:opacity-40" style={{ background: "var(--text)" }}>Start</button>
                <button onClick={stop} disabled={!running} className="rounded-full border px-6 py-3 font-semibold disabled:opacity-40" style={{ borderColor: "currentColor" }}>Stop</button>
                <button onClick={reset} className="rounded-full border px-6 py-3 font-semibold" style={{ borderColor: "currentColor" }}>Reset</button>
              </div>

              <div className="text-xs uppercase tracking-[0.35em] opacity-70">
                {startedAt ? `started ${new Date(startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "not started yet"}
                {endedAt && !running ? ` · ended ${new Date(endedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-black/15 p-3 text-center" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
      <div className="text-[10px] uppercase tracking-[0.3em] opacity-70">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
