/**
 * state-schema.ts - per-cycle state contract between the C++ harness
 * (wasm/viz_core.h + bindings.cpp, which drive OUR sa_top through
 * rtl/viz_top.sv) and the React visualizer.
 * Structure adapted from tiny-tpu's STATE_SCHEMA (MIT, Dineth Hettiarachchi).
 *
 * Sampling convention: a snapshot is taken during cycle t after the inputs of
 * that cycle are applied and before the clock edge. So `w` and `ps` are the
 * register values at the start of the cycle and `a` is the activation each PE
 * is about to multiply this cycle.
 * Every number is read from the Verilated RTL; nothing is computed in JS.
 * All arrays of PE data are row-major, index i*N + j = PE[row i][col j].
 */

/** LOAD = weights being written; STREAM = rows of A still being fed;
 *  DRAIN = all rows fed, results still travelling; DONE = last result row out. */
export type Phase = "LOAD" | "STREAM" | "DRAIN" | "DONE";

export interface CycleState {
  readonly cycle: number;
  readonly phase: Phase;
  /** weight write port (w_we / w_widx) */
  readonly wWe: boolean;
  readonly wIdx: number;
  /** in_valid, and which row of A is being fed this cycle (-1 = none) */
  readonly inValid: boolean;
  readonly inRow: number;
  /** out_valid, and which row of C leaves this cycle (-1 = none) */
  readonly outValid: boolean;
  readonly outRow: number;
  /** a_in elements (raw, before the input skew), length N, int8 */
  readonly aIn: readonly number[];
  /** activation entering row i after the input skew (= a_bus[i][0]), length N */
  readonly aSkew: readonly number[];
  /** c_out elements (after the output de-skew), length N, int32 */
  readonly cOut: readonly number[];
  /** raw partial sum leaving the bottom of column j (before de-skew), length N */
  readonly south: readonly number[];
  /** per PE: stationary weight, activation arriving, psum arriving from above, psum register (output) */
  readonly w: readonly number[];
  readonly a: readonly number[];
  readonly psIn: readonly number[];
  readonly ps: readonly number[];
}

export interface RunData {
  readonly n: number;
  readonly m: number;
  readonly states: readonly CycleState[];
  /** M*N row-major C collected from out_valid/c_out (int32) */
  readonly result: readonly number[];
}
