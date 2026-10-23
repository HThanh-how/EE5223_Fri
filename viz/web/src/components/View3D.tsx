/**
 * View3D - the "3D view" tab. A Three.js scene (lib/scene3d.ts) driven by the SAME per-cycle RTL trace
 * (RunData from the WASM build of our sa_top) that the 2D tab uses. This file owns the playback clock,
 * the caption bar, the cycle counter, the badge and the controls.
 *
 * Query / hash options:  #3d (opens this tab)   ?present=1 (hide controls, for screen recording)
 *                        ?bloom=0 (no glow pass)   ?capture=1 (no auto-playing; frames are driven by
 *                        window.__viz3d.frame(tf) - used by the offline video renderer, see tests/)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import type { RunData } from "@/lib/state-schema";
import { golden, type Mat } from "@/lib/npu";
import { Scene3D, waveCss, type PoseName } from "@/lib/scene3d";
import "@/styles/view3d.css";

type Tab = "array" | "nets" | "3d";
export interface View3DProps { run: RunData; A: Mat; W: Mat; onNav: (t: Tab) => void }

const SEC_PER_CYCLE = 1.5; // wall-clock seconds per RTL cycle at speed 1x
const SPEEDS = [0.25, 0.5, 1, 2] as const;

/** short plain-language caption for the cycle clock value tf */
export function caption3d(run: RunData, tf: number, tGreen: number): { step: number; title: string; sub: string } {
  const N = run.n, M = run.m, S = run.states;
  const t = Math.max(0, Math.min(S.length - 1, Math.floor(tf)));
  const s = S[t];
  const s0 = Math.max(0, S.findIndex((x) => x.phase !== "LOAD"));
  if (tf >= tGreen) return { step: 4, title: "Done: the chip's answer matches the reference", sub: "C = A x W from the hardware equals an ordinary matrix multiply." };
  if (s.phase === "LOAD") {
    const row = s.wWe ? Math.floor(s.wIdx / Math.max(1, N / 4)) + 1 : Math.min(N, t + 1);
    return { step: 1, title: "1  Load the weights once", sub: `Weight row ${row} of ${N} is written. Each block keeps its number (cyan gem) for the whole job.` };
  }
  if (s.outValid) return { step: 4, title: `4  Result row ${s.outRow + 1} of ${M} comes out`, sub: "The finished totals leave the bottom lined up, and become a row of bars in the output matrix C." };
  if (s.inValid) return { step: 2, title: `2  Feed the data: row ${s.inRow + 1} of A enters`, sub: "Each row starts one beat later than the one above it. This skew makes a diagonal wave." };
  if (t < s0 + 2 * N - 1) return { step: 3, title: "3  Multiply and add, block by block", sub: "Each block multiplies the incoming number by its weight, adds the total from above, and passes it down." };
  return { step: 3, title: "4  Last totals flow out", sub: "Small waiting boxes line the columns up so that finished results leave together." };
}

const STEP_NAMES = ["Load weights", "Feed data", "Multiply + add", "Collect results"];

export default function View3D({ run, A, W, onNav }: View3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const tfRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const rafRef = useRef(0);
  const lastTs = useRef(0);
  const lastKey = useRef(-1);
  const sliderRef = useRef<HTMLInputElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const present = q.get("present") === "1";
  const capture = q.get("capture") === "1";

  const [tf, setTfState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [cine, setCine] = useState(q.get("cine") === "1");
  const [glow, setGlow] = useState(q.get("bloom") !== "0");
  const [labels, setLabels] = useState(true);
  const [ready, setReady] = useState(false);
  const [tGreen, setTGreen] = useState(1e9);
  const [err, setErr] = useState<string | null>(null);

  const ref = golden(A, W);
  const match = run.result.length === ref.length * (ref[0]?.length ?? 0) && run.result.every((v, i) => v === ref[Math.floor(i / run.n)][i % run.n]);

  const scene = () => sceneRef.current;

  /** set clock + redraw synchronously (also used by the video renderer) */
  const frame = useCallback((v: number, synchronous = false) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const x = Math.max(-3, Math.min(sc.tEnd + 4, v));
    tfRef.current = x;
    sc.update(x);
    sc.render();
    if (sliderRef.current) sliderRef.current.value = String(x);
    if (badgeRef.current) { // badge fades in as a pure function of the clock (also in captured video frames)
      const k = Math.max(0, Math.min(1, (x - sc.tGreen) / 0.8));
      badgeRef.current.style.opacity = String(0.97 * k);
      badgeRef.current.style.transform = `translate(-50%, 0) scale(${0.8 + 0.2 * k})`;
    }
    const key = Math.floor(x * 4);
    if (synchronous) { lastKey.current = key; flushSync(() => setTfState(x)); }
    else if (key !== lastKey.current) { lastKey.current = key; setTfState(x); }
  }, []);

  // ---- create the scene once
  useEffect(() => {
    const canvas = canvasRef.current!;
    let sc: Scene3D;
    try {
      sc = new Scene3D(canvas, { bloom: q.get("bloom") !== "0", shadows: q.get("shadows") !== "0", maxPixelRatio: Number(q.get("pr") ?? 2) });
    } catch (e) { setErr("WebGL is not available: " + String(e)); return; }
    sceneRef.current = sc;
    const onResize = () => { sc.resize(); sc.update(tfRef.current); sc.render(); };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize); ro.observe(canvas);
    setReady(true);
    return () => { window.removeEventListener("resize", onResize); ro.disconnect(); cancelAnimationFrame(rafRef.current); sc.dispose(); sceneRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- (re)load the run into the scene
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc || !ready) return;
    sc.setRun(run, A, W);
    sc.viewOffsetY = present ? 0.06 : 0.115; sc.resize();
    setTGreen(sc.tGreen);
    if (sliderRef.current) { sliderRef.current.max = String(sc.tEnd); }
    sc.setCinematic(cine);
    frame(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, A, W, ready]);

  // ---- playback loop (disabled in capture mode: frames come from window.__viz3d.frame)
  useEffect(() => {
    if (!ready || capture) return;
    const loop = (ts: number) => {
      const sc = sceneRef.current;
      if (!sc) return;
      if (playingRef.current) {
        const dt = Math.min(0.1, (ts - lastTs.current) / 1000);
        let n = tfRef.current + (dt * speedRef.current) / SEC_PER_CYCLE;
        if (n >= sc.tEnd) { n = sc.tEnd; playingRef.current = false; setPlaying(false); }
        frame(n);
      } else if (sc.cinematic || sc.controls.enabled) {
        // keep damping / manual orbit responsive
        sc.render();
      }
      lastTs.current = ts;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ready, capture, frame]);

  // ---- hooks for tests / video renderer
  useEffect(() => {
    if (!ready) return;
    const sc = sceneRef.current!;
    const api = {
      ready: true,
      get tEnd() { return sc.tEnd; }, get tLast() { return sc.tLast; }, get tGreen() { return sc.tGreen; },
      frame: (v: number) => frame(v, true),
      setCinematic: (on: boolean) => { sc.setCinematic(on); setCine(on); frame(tfRef.current, true); },
      setPose: (n: PoseName) => { sc.setCinematic(false); setCine(false); sc.setPose(n); frame(tfRef.current, true); },
      setBloom: (on: boolean) => { sc.setBloom(on); setGlow(on); frame(tfRef.current, true); },
      info: () => {
        let meshes = 0, sprites = 0, lines = 0;
        sc.scene.traverseVisible((o) => { const x = o as unknown as { isMesh?: boolean; isSprite?: boolean; isLine?: boolean }; if (x.isMesh) meshes++; else if (x.isSprite) sprites++; else if (x.isLine) lines++; });
        return { visibleMeshes: meshes, visibleSprites: sprites, visibleLines: lines, canvas: [sc.renderer.domElement.width, sc.renderer.domElement.height] };
      },
    };
    (window as unknown as { __viz3d: typeof api }).__viz3d = api;
  }, [ready, frame]);

  // ---- UI handlers
  const setPlay = (on: boolean) => {
    const sc = scene(); if (!sc) return;
    if (on && tfRef.current >= sc.tEnd - 1e-6) frame(0);
    playingRef.current = on; setPlaying(on); lastTs.current = performance.now();
  };
  const step = (d: number) => {
    const sc = scene(); if (!sc) return;
    setPlay(false);
    const base = Math.round(tfRef.current * 1000) / 1000;
    const target = d > 0 ? Math.floor(base + 1e-6) + 1 : Math.ceil(base - 1e-6) - 1;
    frame(Math.max(0, Math.min(sc.tLast + 0.0, target)));
  };
  const toggleCine = () => { const sc = scene(); if (!sc) return; const on = !sc.cinematic; sc.setCinematic(on); setCine(on); frame(tfRef.current); };
  const toggleGlow = () => { const sc = scene(); if (!sc) return; sc.setBloom(!sc.bloom); setGlow(sc.bloom); frame(tfRef.current); };
  const toggleLabels = () => { const sc = scene(); if (!sc) return; sc.setLabelsOn(!sc.labelsOn); setLabels(sc.labelsOn); frame(tfRef.current); };
  const pose = (n: PoseName) => { const sc = scene(); if (!sc) return; sc.setCinematic(false); setCine(false); sc.setPose(n); frame(tfRef.current); };
  const onCanvasDown = () => { const sc = scene(); if (sc?.cinematic) { sc.setCinematic(false); setCine(false); } };

  const cap = caption3d(run, tf, tGreen);
  const tInt = Math.max(0, Math.min(run.states.length - 1, Math.floor(tf)));
  const done = tf >= tGreen;
  const phase = run.states[tInt]?.phase ?? "LOAD";

  const tabBtn = (id: Tab, label: string) => (
    <button key={id} onClick={() => onNav(id)} role="tab" aria-selected={id === "3d"} className={"v3d-tab" + (id === "3d" ? " on" : "")}>{label}</button>
  );

  return (
    <div className={"v3d" + (present ? " present" : "")} data-testid="view3d">
      <canvas ref={canvasRef} className="v3d-canvas" onPointerDown={onCanvasDown} />
      {err && <pre className="v3d-err">{err}</pre>}

      <div className="v3d-top">
        <div role="tablist" className="v3d-tabs">
          {tabBtn("array", "The array, step by step")}
          {tabBtn("nets", "Same array: CNN and LSTM")}
          {tabBtn("3d", "3D view")}
        </div>
        <div className="v3d-brand">EE5223 {"·"} INT8 systolic array {"·"} real RTL <span>(sa_top, 4{"×"}4)</span></div>
      </div>

      <div className="v3d-counter" data-testid="cycle-counter">
        <div className="lbl">CLOCK CYCLE</div>
        <div className="num"><b>{String(tInt).padStart(2, "0")}</b><span> / {run.states.length - 1}</span></div>
        <div className="pill">{done ? "DONE" : phase}</div>
      </div>

      <div className="v3d-legend">
        <div><i className="gem" /> weight (stays)</div>
        <div><i className="sph" style={{ background: waveCss(0) }} /> input {"→"}</div>
        <div><i className="cube" style={{ background: waveCss(1) }} /> running total {"↓"}</div>
        <div><i className="bar" /> height = total</div>
        <div className="rows">colour = row of A {Array.from({ length: run.m }, (_, m) => <i key={m} className="dot" style={{ background: waveCss(m) }} />)}</div>
      </div>

      <div ref={badgeRef} className="v3d-badge" data-testid="match-badge-3d" data-match={done ? String(match) : "pending"}>
        {match ? "✓ Matches the reference  (C = A × W)" : "✗ Does not match the reference"}
      </div>

      <div className="v3d-caption" aria-live="polite" data-testid="caption-3d">
        <ol className="v3d-steps">
          {STEP_NAMES.map((n, i) => <li key={n} className={i + 1 === cap.step ? "on" : cap.step === 4 && done ? "all" : ""}>{i + 1} {n}</li>)}
        </ol>
        <div className="title">{cap.title}</div>
        <div className="sub">{cap.sub}</div>
      </div>

      <div className="v3d-controls">
        <div className="row">
          <button className="ib" onClick={() => { setPlay(false); frame(0); }} aria-label="Restart" title="Restart"><RotateCcw size={18} /></button>
          <button className="ib" onClick={() => step(-1)} aria-label="Step back" title="Step back"><ChevronLeft size={18} /></button>
          <button className="ib main" onClick={() => setPlay(!playing)} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button className="ib" onClick={() => step(1)} aria-label="Step forward" title="Step forward"><ChevronRight size={18} /></button>
          <input ref={sliderRef} type="range" min={0} max={20} step={0.01} defaultValue={0} aria-label="cycle scrubber"
            onChange={(e) => { setPlay(false); frame(Number(e.target.value)); }} />
          <span className="spd">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? "on" : ""} onClick={() => { speedRef.current = s; setSpeed(s); }} aria-label={`speed ${s}x`}>{s}x</button>
            ))}
          </span>
        </div>
        <div className="row tog">
          <button className={cine ? "on" : ""} onClick={toggleCine} aria-pressed={cine} data-testid="cine-toggle">Cinematic camera</button>
          <button className={glow ? "on" : ""} onClick={toggleGlow} aria-pressed={glow}>Glow</button>
          <button className={labels ? "on" : ""} onClick={toggleLabels} aria-pressed={labels}>Numbers</button>
          <span className="sep" />
          <span className="lbl">View</span>
          {(["iso", "top", "side", "low", "close"] as PoseName[]).map((p) => <button key={p} onClick={() => pose(p)}>{p}</button>)}
          <span className="hint">drag = orbit {"·"} wheel = zoom {"·"} right-drag = pan</span>
        </div>
      </div>
    </div>
  );
}
