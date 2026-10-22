/** npu.ts - browser-side loader for the WASM build of OUR sa_top (npu_viz.wasm),
 *  plus the in-page golden reference. Loader pattern adapted from tiny-tpu (MIT). */
import type { RunData } from "./state-schema";

interface RawSim {
  getN(): number;
  run(a: number[], m: number, w: number[]): RunData;
}
interface RawModule { NpuSim: new () => RawSim }

let sim: RawSim | null = null;

export async function loadNpu(): Promise<void> {
  if (sim) return;
  if (typeof window === "undefined") throw new Error("loadNpu is browser-only");
  const url = new URL((import.meta.env.BASE_URL as string) + "npu_viz.mjs", window.location.href).href;
  const { default: factory } = (await import(/* @vite-ignore */ url)) as {
    default: () => Promise<RawModule>;
  };
  const mod = await factory();
  sim = new mod.NpuSim();
}

export type Mat = number[][];
export const flat = (m: Mat): number[] => m.flat();

/** Run the RTL: C = A (M x N) x W (N x N). */
export function runNpu(A: Mat, W: Mat): RunData {
  if (!sim) throw new Error("WASM not loaded");
  return sim.run(flat(A), A.length, flat(W));
}

export function getN(): number {
  if (!sim) throw new Error("WASM not loaded");
  return sim.getN();
}

/** Plain-JS reference (what numpy `A @ W` gives), used to check the RTL result. */
export function golden(A: Mat, W: Mat): Mat {
  return A.map((row) => W[0].map((_, j) => row.reduce((s, a, k) => s + a * W[k][j], 0)));
}

export const clamp8 = (v: number) => Math.max(-128, Math.min(127, Math.trunc(v) || 0));

// ---- wave colours: every row of A gets its own colour so the diagonal wave is easy to follow
export const waveColor = (m: number) => `oklch(0.78 0.16 ${(25 + m * 47) % 360})`;
export const waveSoft = (m: number) => `oklch(0.78 0.16 ${(25 + m * 47) % 360} / 0.22)`;
