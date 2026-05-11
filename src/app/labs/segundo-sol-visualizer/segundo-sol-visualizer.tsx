"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type PresetName = "ritual" | "oceanic" | "solar storm";

type VisualPreset = {
  name: PresetName;
  label: string;
  bass: number;
  liquid: number;
  shimmer: number;
  bloom: number;
  gravity: number;
};

const PRESETS: VisualPreset[] = [
  { name: "ritual", label: "ritual glow", bass: 1.15, liquid: 0.9, shimmer: 0.8, bloom: 1.05, gravity: 0.62 },
  { name: "oceanic", label: "liquid altar", bass: 0.85, liquid: 1.45, shimmer: 0.7, bloom: 0.95, gravity: 0.45 },
  { name: "solar storm", label: "solar storm", bass: 1.35, liquid: 1.1, shimmer: 1.55, bloom: 1.3, gravity: 0.8 },
];

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMids;
uniform float uHighs;
uniform float uEnergy;
uniform float uLiquid;
uniform float uBloom;
uniform float uGravity;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.62, 1.12, -1.12, 1.62) * p + 0.13;
    a *= 0.5;
  }
  return v;
}

float sun(vec2 p, vec2 center, float radius, float pulse, float liquid) {
  vec2 q = p - center;
  float angle = atan(q.y, q.x);
  float ripple = sin(angle * 9.0 + uTime * (0.8 + uEnergy * 1.6)) * 0.025;
  ripple += sin(angle * 17.0 - uTime * 1.1) * 0.013;
  float water = fbm(q * (4.5 + liquid * 3.0) + vec2(uTime * 0.09, -uTime * 0.06));
  float r = radius + pulse * 0.09 + ripple * liquid + (water - 0.5) * 0.095 * liquid;
  float d = length(q);
  float disc = smoothstep(r, r - 0.035, d);
  float aura = exp(-max(d - r, 0.0) * (4.0 - uBloom * 0.7));
  return disc * 1.35 + aura * (0.52 + pulse * 0.9);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * 2.0 - 1.0);
  p.x *= uResolution.x / uResolution.y;

  float breath = sin(uTime * (0.22 + uEnergy * 0.5)) * 0.5 + 0.5;
  vec2 flow = vec2(
    fbm(p * 1.4 + vec2(uTime * 0.035, uTime * 0.018)),
    fbm(p * 1.7 + vec2(-uTime * 0.024, uTime * 0.03))
  ) - 0.5;
  vec2 warped = p + flow * (0.11 + uMids * 0.31) * uLiquid;

  float dist = length(warped);
  vec3 indigo = vec3(0.015, 0.018, 0.075);
  vec3 deep = vec3(0.002, 0.006, 0.025);
  vec3 color = mix(indigo, deep, smoothstep(0.0, 1.35, dist));

  float nebula = fbm(warped * 2.2 + uTime * 0.025);
  float veil = smoothstep(0.34, 0.82, nebula) * (0.08 + uMids * 0.24);
  color += vec3(0.11, 0.035, 0.22) * veil;
  color += vec3(0.95, 0.42, 0.09) * pow(max(0.0, 1.0 - dist), 3.2) * 0.12 * (0.6 + breath);

  float separation = 0.34 + uGravity * 0.08 + sin(uTime * 0.13) * 0.025;
  float leftSun = sun(warped, vec2(-separation, 0.06 + flow.x * 0.045), 0.22, uBass, uLiquid);
  float rightSun = sun(warped, vec2(separation, -0.02 + flow.y * 0.045), 0.195, uBass * 0.92, uLiquid);
  float bridge = exp(-abs(warped.y + sin(warped.x * 4.0 + uTime * 0.45) * 0.075) * 7.5) * exp(-abs(warped.x) * 1.7);
  bridge *= (0.12 + uEnergy * 0.38) * uLiquid;

  vec3 gold = vec3(1.0, 0.52, 0.13);
  vec3 amber = vec3(1.0, 0.78, 0.27);
  vec3 coral = vec3(0.95, 0.2, 0.08);
  color += gold * leftSun * (0.62 + uBloom * 0.3);
  color += amber * rightSun * (0.58 + uBloom * 0.35);
  color += mix(coral, amber, breath) * bridge;

  float rings = sin((length(warped) - uTime * (0.04 + uEnergy * 0.11)) * 32.0 + fbm(warped * 5.0) * 6.0);
  color += vec3(0.9, 0.38, 0.08) * smoothstep(0.77, 1.0, rings) * 0.035 * uLiquid * (0.4 + uMids);

  vec2 starGrid = floor((uv + flow * 0.035) * vec2(150.0, 92.0));
  float star = step(0.988 - uHighs * 0.012, hash(starGrid));
  float twinkle = pow(hash(starGrid + floor(uTime * (1.5 + uEnergy * 5.0))), 9.0);
  color += vec3(0.96, 0.82, 0.48) * star * (0.15 + twinkle * (0.85 + uHighs * 2.2)) * (0.55 + uHighs * uBloom);

  float vignette = smoothstep(1.55, 0.22, length(p));
  color *= 0.55 + vignette * (0.62 + uEnergy * 0.25);
  color = pow(color, vec3(0.82));
  gl_FragColor = vec4(color, 1.0);
}
`;

function averageRange(data: Uint8Array<ArrayBuffer>, from: number, to: number) {
  let sum = 0;
  const end = Math.min(data.length, to);
  for (let i = from; i < end; i += 1) sum += data[i];
  return sum / Math.max(1, end - from) / 255;
}

export default function SegundoSolVisualizer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const [fileName, setFileName] = useState("drop a mix or audio file");
  const [isPlaying, setIsPlaying] = useState(false);
  const [presetName, setPresetName] = useState<PresetName>("ritual");
  const [bass, setBass] = useState(1.15);
  const [liquid, setLiquid] = useState(0.9);
  const [shimmer, setShimmer] = useState(0.8);
  const [bloom, setBloom] = useState(1.05);
  const [gravity, setGravity] = useState(0.62);

  const preset = useMemo(() => PRESETS.find((item) => item.name === presetName) ?? PRESETS[0], [presetName]);

  useEffect(() => {
    setBass(preset.bass);
    setLiquid(preset.liquid);
    setShimmer(preset.shimmer);
    setBloom(preset.bloom);
    setGravity(preset.gravity);
  }, [preset]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    const uniforms = {
      uResolution: { value: new THREE.Vector2(mountRef.current.clientWidth, mountRef.current.clientHeight) },
      uTime: { value: 0 },
      uBass: { value: 0.15 },
      uMids: { value: 0.12 },
      uHighs: { value: 0.1 },
      uEnergy: { value: 0.1 },
      uLiquid: { value: liquid },
      uBloom: { value: bloom },
      uGravity: { value: gravity },
    };

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
    );
    scene.add(mesh);

    const clock = new THREE.Clock();
    const smooth = { bass: 0.14, mids: 0.12, highs: 0.1, energy: 0.1 };
    const render = () => {
      const data = dataRef.current;
      if (analyserRef.current && data) {
        analyserRef.current.getByteFrequencyData(data);
        const rawBass = averageRange(data, 1, 12) * bass;
        const rawMids = averageRange(data, 12, 86) * liquid;
        const rawHighs = averageRange(data, 86, 220) * shimmer;
        const rawEnergy = averageRange(data, 1, 220) * ((bass + liquid + shimmer) / 3);
        smooth.bass += (rawBass - smooth.bass) * 0.16;
        smooth.mids += (rawMids - smooth.mids) * 0.12;
        smooth.highs += (rawHighs - smooth.highs) * 0.22;
        smooth.energy += (rawEnergy - smooth.energy) * 0.1;
      } else {
        smooth.bass += (0.16 - smooth.bass) * 0.02;
        smooth.mids += (0.18 - smooth.mids) * 0.02;
        smooth.highs += (0.14 - smooth.highs) * 0.02;
        smooth.energy += (0.14 - smooth.energy) * 0.02;
      }

      uniforms.uTime.value = clock.getElapsedTime() * (0.82 + smooth.energy * 1.15);
      uniforms.uBass.value = smooth.bass;
      uniforms.uMids.value = smooth.mids;
      uniforms.uHighs.value = smooth.highs;
      uniforms.uEnergy.value = smooth.energy;
      uniforms.uLiquid.value = liquid;
      uniforms.uBloom.value = bloom;
      uniforms.uGravity.value = gravity;
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    const resize = () => {
      if (!mountRef.current) return;
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
      uniforms.uResolution.value.set(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mesh.geometry.dispose();
      mesh.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [bass, liquid, shimmer, bloom, gravity]);

  const ensureAudioGraph = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    if (!sourceRef.current) {
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    if (context.state === "suspended") await context.resume();
  };

  const loadFile = (file?: File) => {
    if (!file || !audioRef.current) return;
    const url = URL.createObjectURL(file);
    audioRef.current.src = url;
    audioRef.current.load();
    setFileName(file.name);
    setIsPlaying(false);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    loadFile(event.dataTransfer.files?.[0]);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    await ensureAudioGraph();
    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#030512] text-orange-50">
      <section className="relative min-h-screen p-4 sm:p-6 lg:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_10%,rgba(255,135,31,0.18),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(250,190,70,0.14),transparent_26%),linear-gradient(135deg,#040617,#080522_48%,#120719)]" />
        <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col gap-5 lg:flex-row">
          <div className="relative min-h-[62vh] flex-1 overflow-hidden rounded-[2rem] border border-orange-200/15 bg-black shadow-2xl shadow-orange-950/40">
            <div ref={mountRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.38)_100%)]" />
            <div className="pointer-events-none absolute left-5 top-5 rounded-full border border-orange-100/15 bg-black/25 px-4 py-2 text-xs uppercase tracking-[0.3em] text-orange-100/75 backdrop-blur-md">
              segundo sol / hidden lab
            </div>
            <div className="pointer-events-none absolute bottom-5 left-5 right-5 rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
              <p className="max-w-3xl text-sm text-orange-50/80">
                twin suns in deep indigo space. bass breathes the suns, mids pull the liquid wall, highs wake the stars.
              </p>
            </div>
          </div>

          <aside className="w-full rounded-[2rem] border border-orange-100/15 bg-[#090817]/85 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:w-[360px]">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.35em] text-orange-200/55">v1 visualizer</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-orange-50">two suns, breathing</h1>
              <p className="mt-3 text-sm leading-6 text-orange-100/62">
                upload a DJ mix or track and tune the proof of concept live. this is preview-only for now — no export pipeline yet.
              </p>
            </div>

            <label
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-orange-200/30 bg-orange-200/5 p-6 text-center transition hover:border-orange-200/60 hover:bg-orange-200/10"
            >
              <span className="text-sm font-medium text-orange-50">{fileName}</span>
              <span className="mt-2 text-xs text-orange-100/50">drop audio here or click to choose</span>
              <input className="hidden" type="file" accept="audio/*" onChange={handleFile} />
            </label>

            <audio ref={audioRef} onEnded={() => setIsPlaying(false)} className="mb-4 w-full" controls />
            <button
              onClick={togglePlay}
              className="mb-5 w-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 px-5 py-3 text-sm font-semibold text-[#160905] shadow-lg shadow-orange-900/35 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? "pause visualizer" : "play / connect audio"}
            </button>

            <div className="mb-5 grid grid-cols-3 gap-2">
              {PRESETS.map((item) => (
                <button
                  key={item.name}
                  onClick={() => setPresetName(item.name)}
                  className={`rounded-2xl border px-3 py-3 text-xs font-medium transition ${presetName === item.name ? "border-orange-200/70 bg-orange-200/20 text-orange-50" : "border-white/10 bg-white/[0.03] text-orange-100/55 hover:bg-white/[0.07]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <Slider label="bass sun pulse" value={bass} min={0.25} max={2} onChange={setBass} />
              <Slider label="liquid wall" value={liquid} min={0.15} max={2} onChange={setLiquid} />
              <Slider label="star shimmer" value={shimmer} min={0.1} max={2.2} onChange={setShimmer} />
              <Slider label="solar bloom" value={bloom} min={0.2} max={2} onChange={setBloom} />
              <Slider label="sun gravity" value={gravity} min={0} max={1.4} onChange={setGravity} />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-orange-100/55">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full accent-orange-300"
      />
    </label>
  );
}
