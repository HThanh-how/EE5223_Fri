/**
 * useNpuViz - loads the WASM build of our RTL, runs a (A, W) pair through it and
 * owns the per-cycle playback engine (play / pause / step / scrub / speed).
 * Playback engine adapted from tiny-tpu's useTinyTpu (MIT).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadNpu, runNpu, type Mat } from "@/lib/npu";
import type { RunData } from "@/lib/state-schema";

export const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];
const BASE_INTERVAL_MS = 900;

export function useNpuViz(initA: Mat, initW: Mat) {
  const [run, setRun] = useState<RunData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<SpeedOption>(1);

  const runRef = useRef<RunData | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<SpeedOption>(1);
  const rafRef = useRef(0);
  const lastRef = useRef(0);

  const last = () => Math.max(0, (runRef.current?.states.length ?? 1) - 1);
  const setTime = (v: number) => { tRef.current = v; setT(v); };

  const tick = useCallback((ts: number) => {
    if (!playingRef.current) return;
    if (ts - lastRef.current >= BASE_INTERVAL_MS / speedRef.current) {
      lastRef.current = ts;
      const next = tRef.current + 1;
      if (next >= last()) {
        playingRef.current = false; setPlaying(false); setTime(last()); return;
      }
      setTime(next);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const pause = useCallback(() => {
    playingRef.current = false; setPlaying(false); cancelAnimationFrame(rafRef.current);
  }, []);

  const play = useCallback(() => {
    if (!runRef.current) return;
    if (tRef.current >= last()) setTime(0);
    playingRef.current = true; setPlaying(true);
    lastRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const execute = useCallback((A: Mat, W: Mat, autoplay: boolean) => {
    try {
      pause();
      const r = runNpu(A, W);
      runRef.current = r; setRun(r); setError(null); setTime(0);
      if (autoplay) setTimeout(() => play(), 400);
    } catch (e) { setError(String(e)); }
  }, [pause, play]);

  useEffect(() => {
    let dead = false;
    loadNpu().then(() => { if (!dead) execute(initA, initW, false); })
      .catch((e) => setError(String(e)));
    const vis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", vis);
    return () => { dead = true; cancelAnimationFrame(rafRef.current); document.removeEventListener("visibilitychange", vis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    run, error, t, playing, speed,
    total: run?.states.length ?? 0,
    toggle: () => (playingRef.current ? pause() : play()),
    stepForward: () => { pause(); setTime(Math.min(tRef.current + 1, last())); },
    stepBack: () => { pause(); setTime(Math.max(tRef.current - 1, 0)); },
    reset: () => { pause(); setTime(0); },
    scrub: (v: number) => { pause(); setTime(Math.max(0, Math.min(v, last()))); },
    setSpeed: (s: SpeedOption) => { speedRef.current = s; setSpeedState(s); },
    execute,
  };
}
