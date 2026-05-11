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
  { name: "solar storm", label: "solar storm", bass: 1.45, liquid: 1.25, shimmer: 1.8, bloom: 1.45, gravity: 0.8 },
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
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.58, 1.04, -1.04, 1.58) * p + 0.17;
    a *= 0.52;
  }
  return v;
}

float circleMask(vec2 p, vec2 center, float radius, float softness) {
  return smoothstep(radius + softness, radius - softness, length(p - center));
}

float sphereLight(vec2 p, vec2 center, float radius, vec3 lightDir) {
  vec2 q = (p - center) / radius;
  float rr = dot(q, q);
  if (rr > 1.0) return 0.0;
  vec3 n = normalize(vec3(q, sqrt(max(0.0, 1.0 - rr))));
  float diffuse = max(dot(n, normalize(lightDir)), 0.0);
  float rim = pow(1.0 - max(n.z, 0.0), 2.4);
  float spec = pow(max(dot(reflect(-normalize(lightDir), n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  return diffuse * 0.72 + rim * 0.34 + spec * (0.18 + uHighs * 0.38);
}

float crescentCut(vec2 p, vec2 center, float radius) {
  vec2 q = p - center;
  float arc = abs(length(q) - radius);
  float arcBand = smoothstep(0.028, 0.0, arc);
  float angle = atan(q.y, q.x);
  float gate = smoothstep(-1.12, -0.72, angle) * (1.0 - smoothstep(0.1, 0.46, angle));
  gate *= smoothstep(-0.24, 0.04, q.x) * (1.0 - smoothstep(0.56, 0.78, q.x));
  return arcBand * gate;
}

vec3 watercolor(vec2 p, vec2 center, vec3 hot, vec3 cool, float seed, float audio) {
  vec2 q = p - center;
  float paper = fbm(q * 7.5 + seed + vec2(uTime * 0.035, -uTime * 0.022));
  float bloom = fbm(q * 2.7 + seed * 2.0 - uTime * 0.03);
  float vertical = smoothstep(-0.42, 0.44, q.y + (bloom - 0.5) * 0.25);
  vec3 col = mix(cool, hot, vertical);
  col += vec3(1.0, 0.36, 0.02) * smoothstep(0.55, 0.98, bloom) * 0.25;
  col += vec3(1.0, 0.84, 0.28) * smoothstep(0.62, 1.0, paper) * (0.11 + audio * 0.15);
  col *= 0.78 + paper * 0.3;
  return col;
}

float particleRiver(vec2 p, float layer, float speed, float density) {
  vec2 q = p;
  q.x += sin(q.y * (2.2 + layer) + uTime * 0.22) * 0.18;
  q.y += uTime * speed + fbm(q * 1.8 + layer) * 0.38;
  vec2 grid = fract(q * density) - 0.5;
  vec2 id = floor(q * density);
  float n = hash(id + layer * 11.7);
  float d = length(grid + vec2(sin(n * 6.28 + uTime * speed), cos(n * 6.28)) * 0.18);
  float spark = smoothstep(0.09, 0.0, d) * step(0.62, n);
  return spark * (0.45 + pow(n, 3.0));
}

float shockwave(vec2 p, vec2 center, float phase, float amp) {
  float d = length(p - center);
  float ring = abs(fract(d * 2.8 - phase) - 0.5);
  return smoothstep(0.045 + amp * 0.02, 0.0, ring) * exp(-d * 0.9) * amp;
}

vec3 cinematicStars(vec2 p, float layer, float scale, float threshold, float speed, float audio) {
  vec2 q = p;
  q.y += uTime * speed;
  q.x += sin(q.y * 0.8 + uTime * 0.16 + layer) * 0.18;
  vec2 cell = floor(q * scale);
  vec2 local = fract(q * scale) - 0.5;
  float seed = hash(cell + layer * 37.1);
  vec2 offset = vec2(hash(cell + layer + 2.4), hash(cell - layer + 7.8)) - 0.5;
  local -= offset * 0.54;
  float present = step(threshold - audio * 0.045, seed);
  float size = mix(0.022, 0.075, pow(seed, 8.0)) * (1.0 + audio * 1.8);
  float d = length(local);
  float core = exp(-d * d / (size * size));
  float halo = exp(-d * 13.0) * (0.16 + audio * 0.36);
  float rays = (exp(-abs(local.x) * 32.0) + exp(-abs(local.y) * 32.0)) * exp(-d * 7.5);
  float diagonal = (exp(-abs(local.x + local.y) * 28.0) + exp(-abs(local.x - local.y) * 28.0)) * exp(-d * 8.0);
  float twinkle = 0.42 + 0.58 * sin(uTime * (1.4 + seed * 5.8 + audio * 7.0) + seed * 38.0);
  vec3 warm = vec3(1.0, 0.76, 0.42);
  vec3 cool = vec3(0.55, 0.72, 1.0);
  vec3 white = vec3(1.0, 0.94, 0.82);
  vec3 tint = mix(cool, warm, hash(cell + 19.0));
  tint = mix(tint, white, pow(seed, 10.0));
  float intensity = present * (core * (0.75 + twinkle * 1.6) + halo + rays * (0.18 + audio * 0.9) + diagonal * audio * 0.45);
  return tint * intensity;
}

vec3 starStreaks(vec2 p, float audio, float bass) {
  vec2 q = p;
  q.y += uTime * (0.22 + audio * 0.9 + bass * 0.65);
  q.x += sin(q.y * 2.0 + uTime * 0.5) * 0.12;
  vec2 cell = floor(q * vec2(42.0, 78.0));
  vec2 local = fract(q * vec2(42.0, 78.0)) - 0.5;
  float seed = hash(cell);
  float active = step(0.92 - audio * 0.08 - bass * 0.035, seed);
  float tail = exp(-abs(local.x) * 38.0) * smoothstep(0.48, -0.45, local.y) * exp(-max(local.y, 0.0) * 6.0);
  return vec3(0.95, 0.62, 0.32) * tail * active * (0.15 + audio * 0.85 + bass * 0.5);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * 2.0 - 1.0);
  p.x *= uResolution.x / uResolution.y;

  float breath = sin(uTime * (0.18 + uEnergy * 0.42)) * 0.5 + 0.5;
  float beat = pow(clamp(uBass * 1.25, 0.0, 1.8), 1.55);
  vec2 journey = vec2(
    sin(uTime * 0.105) * 0.34 + sin(uTime * 0.037) * 0.2,
    uTime * (0.11 + uEnergy * 0.32)
  );
  vec2 cameraDrift = vec2(sin(uTime * 0.071), cos(uTime * 0.053)) * (0.1 + uEnergy * 0.24);
  vec2 travelP = p + journey + cameraDrift;
  vec2 flow = vec2(
    fbm(travelP * 1.25 + vec2(uTime * 0.05, uTime * 0.02)),
    fbm(travelP * 1.6 + vec2(-uTime * 0.035, uTime * 0.042))
  ) - 0.5;
  vec2 warped = p + flow * (0.13 + uMids * 0.42 + beat * 0.18) * uLiquid;
  warped += vec2(sin(p.y * 3.0 + uTime * 0.7), cos(p.x * 2.5 - uTime * 0.55)) * beat * 0.055;

  float dist = length(warped);
  vec3 cream = vec3(0.965, 0.93, 0.855);
  vec3 indigo = vec3(0.012, 0.016, 0.068);
  vec3 deep = vec3(0.002, 0.004, 0.02);
  vec3 color = mix(indigo, deep, smoothstep(0.0, 1.45, dist));

  float paperField = fbm((warped + journey * 0.32) * 3.0 + uTime * 0.018);
  color = mix(color, cream * (0.82 + paperField * 0.13), 0.055 + uBloom * 0.018);
  float nebulaA = smoothstep(0.28, 0.86, fbm(travelP * 1.15 + flow * 1.8));
  float nebulaB = smoothstep(0.45, 0.9, fbm(travelP * 2.8 - uTime * 0.045));
  color += vec3(0.08, 0.03, 0.22) * nebulaA * (0.1 + uMids * 0.34);
  color += vec3(0.95, 0.28, 0.08) * nebulaB * (0.035 + beat * 0.09);
  color += vec3(0.18, 0.08, 0.36) * shockwave(p, vec2(0.0), uTime * (0.22 + uEnergy * 0.38), beat);

  float stackBreath = 1.0 + beat * 0.23 + breath * 0.055;
  vec2 orbit = vec2(sin(uTime * 0.23), cos(uTime * 0.19)) * (0.06 + beat * 0.11 + uEnergy * 0.06);
  vec2 topCenter = vec2(0.0, 0.205) + orbit + flow * (0.09 + beat * 0.13);
  vec2 bottomCenter = vec2(0.0, -0.24) - orbit * 0.7 + flow.yx * (0.07 + beat * 0.1);
  float topRadius = (0.39 + beat * 0.105) * stackBreath;
  float bottomRadius = (0.355 + beat * 0.095) * stackBreath;
  float liquidEdge = (fbm(warped * (7.2 + uLiquid * 2.4) + uTime * 0.06) - 0.5) * 0.055 * uLiquid;

  float bottomDisc = circleMask(warped, bottomCenter, bottomRadius + liquidEdge, 0.015 + uMids * 0.018);
  float topDisc = circleMask(warped, topCenter, topRadius + liquidEdge * 0.9, 0.015 + uMids * 0.018);
  vec3 bottomColor = watercolor(warped, bottomCenter, vec3(1.0, 0.27, 0.20), vec3(0.84, 0.14, 0.92), 4.2, uMids);
  vec3 topColor = watercolor(warped, topCenter, vec3(1.0, 0.70, 0.08), vec3(1.0, 0.22, 0.08), 1.7, uBass);
  float topLight = sphereLight(warped, topCenter, topRadius, vec3(-0.35, 0.42, 0.88));
  float bottomLight = sphereLight(warped, bottomCenter, bottomRadius, vec3(0.32, 0.5, 0.82));
  topColor *= 0.68 + topLight * (0.88 + uBloom * 0.28);
  bottomColor *= 0.62 + bottomLight * (0.9 + uBloom * 0.24);
  topColor += vec3(1.0, 0.86, 0.42) * pow(topLight, 3.2) * (0.18 + uHighs * 0.22);
  bottomColor += vec3(1.0, 0.36, 0.86) * pow(bottomLight, 3.0) * (0.16 + uHighs * 0.2);

  float lowerAura = exp(-max(length(warped - bottomCenter) - bottomRadius, 0.0) * 7.5) * 0.32;
  float upperAura = exp(-max(length(warped - topCenter) - topRadius, 0.0) * 7.2) * 0.38;
  color += vec3(1.0, 0.25, 0.78) * lowerAura * (0.32 + uBloom * 0.28);
  color += vec3(1.0, 0.52, 0.05) * upperAura * (0.36 + uBloom * 0.34);
  color = mix(color, bottomColor, bottomDisc * 0.94);
  color = mix(color, topColor, topDisc * 0.96);

  float overlap = topDisc * bottomDisc;
  color += vec3(1.0, 0.2, 0.04) * overlap * (0.18 + uBass * 0.18);

  float cut = crescentCut(warped + vec2(0.015, -0.005), vec2(0.17, 0.11), 0.31 + uBass * 0.025);
  vec3 cutColor = mix(cream, vec3(1.0, 0.92, 0.73), 0.35 + paperField * 0.3);
  color = mix(color, cutColor, cut * 0.92);
  color += vec3(1.0, 0.62, 0.2) * smoothstep(0.18, 0.0, abs(length(warped - vec2(0.17, 0.11)) - 0.31)) * cut * 0.25;

  float rings = sin((length(warped - vec2(0.0, -0.02)) - uTime * (0.035 + uEnergy * 0.09)) * 34.0 + fbm(warped * 5.2) * 6.0);
  color += vec3(1.0, 0.32, 0.08) * smoothstep(0.79, 1.0, rings) * 0.045 * uLiquid * (0.35 + uMids) * (topDisc + bottomDisc + 0.22);

  float contour = abs(length(warped - topCenter) - topRadius) + abs(length(warped - bottomCenter) - bottomRadius);
  color += vec3(1.0, 0.66, 0.22) * smoothstep(0.08, 0.0, contour) * 0.05 * (0.5 + uBass);
  float filament = smoothstep(0.64, 1.0, fbm(warped * 12.0 + flow * 5.0 + uTime * (0.12 + uEnergy * 0.22)));
  color += vec3(1.0, 0.45, 0.12) * filament * (topDisc + bottomDisc) * 0.08 * (0.4 + uMids);

  float riverA = particleRiver(travelP + flow * 0.5, 1.0, 0.16 + uEnergy * 0.45, 16.0 + uHighs * 12.0);
  float riverB = particleRiver(travelP * 1.35 - flow * 0.8, 4.0, -0.11 - beat * 0.28, 24.0 + uHighs * 16.0);
  float dust = particleRiver(travelP * 0.72 + vec2(0.0, uTime * 0.18), 8.0, 0.08 + uEnergy * 0.24, 9.0);
  vec2 starSpace = p + journey * 0.18 + flow * (0.08 + uHighs * 0.08);
  vec3 stars = vec3(0.0);
  stars += cinematicStars(starSpace * 0.72, 1.0, 28.0, 0.965, 0.035 + uEnergy * 0.08, uHighs + beat * 0.35);
  stars += cinematicStars(starSpace * 1.15 + vec2(3.1, -1.8), 2.0, 48.0, 0.982, 0.075 + uEnergy * 0.18, uHighs * 1.25 + beat * 0.25);
  stars += cinematicStars(starSpace * 1.9 - vec2(2.4, 4.2), 3.0, 76.0, 0.991, 0.13 + uEnergy * 0.27, uHighs * 1.65 + beat * 0.18);
  stars += starStreaks(starSpace + flow * 0.4, uHighs + uEnergy * 0.4, beat);
  float starOcclusion = 1.0 - clamp((topDisc + bottomDisc) * 0.85, 0.0, 0.85);
  color += stars * starOcclusion * (0.56 + uBloom * 0.28);
  color += vec3(1.0, 0.58, 0.2) * riverA * (0.16 + uHighs * 0.75 + beat * 0.25);
  color += vec3(0.86, 0.22, 1.0) * riverB * (0.12 + uHighs * 0.62 + uMids * 0.18);
  color += vec3(0.45, 0.7, 1.0) * dust * (0.05 + uEnergy * 0.18);

  float vignette = smoothstep(1.58, 0.18, length(p));
  color *= 0.58 + vignette * (0.65 + uEnergy * 0.22);
  color = pow(color, vec3(0.86));
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
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [fileName, setFileName] = useState("drop a mix or audio file");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [exportMode, setExportMode] = useState<"idle" | "clip" | "full">("idle");
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
    rendererRef.current = renderer;
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
        const rawBass = averageRange(data, 1, 14) * bass;
        const rawMids = averageRange(data, 14, 104) * liquid;
        const rawHighs = averageRange(data, 104, 255) * shimmer;
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
      rendererRef.current = null;
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
      const recordingDestination = context.createMediaStreamDestination();
      source.connect(analyser);
      analyser.connect(context.destination);
      analyser.connect(recordingDestination);
      recordingDestinationRef.current = recordingDestination;
      sourceRef.current = source;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    if (!recordingDestinationRef.current) {
      const recordingDestination = context.createMediaStreamDestination();
      analyserRef.current?.connect(recordingDestination);
      recordingDestinationRef.current = recordingDestination;
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
    setExportMode("idle");
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    loadFile(event.dataTransfer.files?.[0]);
  };

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
  };


  const downloadStill = () => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `segundo-sol-${Date.now()}.png`;
    link.click();
  };

  const toggleRecording = async (mode: "clip" | "full" = "clip") => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
      setIsRecording(false);
      setExportMode("idle");
      return;
    }

    setExportMode(mode);
    await ensureAudioGraph();
    const canvasStream = canvas.captureStream(30);
    const audioTracks = recordingDestinationRef.current?.stream.getAudioTracks() ?? [];
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    recordedChunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `segundo-sol-${mode === "full" ? "full-mix" : "clip"}-${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
      setIsRecording(false);
      setExportMode("idle");
    };
    recorder.start(1000);
    setIsRecording(true);
  };

  const exportFullMix = async () => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.stop();
      setIsRecording(false);
      setExportMode("idle");
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    await toggleRecording("full");
    await audio.play();
    setIsPlaying(true);
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
                twin suns moving through deep indigo space. bass drives the bodies and shockwaves, mids bend the field, highs ignite cinematic stars and particle rivers.
              </p>
            </div>
          </div>

          <aside className="w-full rounded-[2rem] border border-orange-100/15 bg-[#090817]/85 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:w-[360px]">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.35em] text-orange-200/55">v1 visualizer</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-orange-50">two suns, breathing</h1>
              <p className="mt-3 text-sm leading-6 text-orange-100/62">
                upload a DJ mix or track and tune the proof of concept live. export a full real-time WebM, capture a shorter clip, or grab a still when the look hits.
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

            <audio
              ref={audioRef}
              onEnded={() => {
                setIsPlaying(false);
                if (exportMode === "full" && recorderRef.current?.state === "recording") {
                  recorderRef.current.stop();
                }
              }}
              className="mb-4 w-full"
              controls
            />
            <button
              onClick={togglePlay}
              className="mb-5 w-full rounded-full bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500 px-5 py-3 text-sm font-semibold text-[#160905] shadow-lg shadow-orange-900/35 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? "pause visualizer" : "play / connect audio"}
            </button>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                onClick={exportFullMix}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${isRecording && exportMode === "full" ? "border-rose-200/80 bg-rose-400/25 text-rose-50" : "border-orange-200/50 bg-orange-300/15 text-orange-50 hover:bg-orange-300/25"}`}
              >
                {isRecording && exportMode === "full" ? "exporting full mix…" : "export full mix"}
              </button>
              <button
                onClick={() => toggleRecording("clip")}
                className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${isRecording ? "border-rose-200/80 bg-rose-400/25 text-rose-50" : "border-orange-200/30 bg-white/[0.04] text-orange-50 hover:bg-white/[0.08]"}`}
              >
                {isRecording ? "stop + download" : "export clip"}
              </button>
              <button
                onClick={downloadStill}
                className="col-span-2 rounded-2xl border border-orange-200/30 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-orange-50 transition hover:bg-white/[0.08]"
              >
                download PNG still
              </button>
            </div>
            <p className="mb-5 text-xs leading-5 text-orange-100/45">full export renders the whole track from start to finish and downloads automatically at the end. faster-than-realtime export needs the next render pipeline.</p>

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

function FormatTime({ seconds }: { seconds: number }) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return <span>{minutes}:{secs}</span>;
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
