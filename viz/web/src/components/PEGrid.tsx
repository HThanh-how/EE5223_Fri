/**
 * PEGrid - SVG rendering of the N x N weight-stationary array for ONE cycle of the RTL trace.
 * Layout idea and PE-cell styling adapted from tiny-tpu's PEGrid (MIT, Dineth Hettiarachchi);
 * rewritten for sa_top: input-skew delay chains on the left, output de-skew chains below.
 *
 * Every number drawn comes from the recorded RTL trace. The colour of a number
 * (which row of A it belongs to) is derived from the known pipeline timing
 * (see waveAt) and is only used for colouring.
 */
import type { RunData } from "@/lib/state-schema";
import { waveColor, waveSoft } from "@/lib/npu";

const MONO = "ui-monospace, 'Geist Mono', SFMono-Regular, Menlo, Consolas, monospace";

export interface PEGridProps { run: RunData; t: number }

export function PEGrid({ run, t }: PEGridProps) {
  const N = run.n;
  const S = run.states;
  const s = S[t];
  const CELL = N <= 4 ? 84 : 60;
  const GAP = 10;
  const PITCH = CELL + GAP;
  const BW = 30, BH = 24, BP = 34;      // skew-chain boxes (horizontal)
  const RW = N <= 4 ? 70 : 54, RH = 28; // result boxes
  const VP = 28;                        // vertical chain pitch
  const feedX = 4;
  const LEFT = feedX + BW + 22 + (N - 1) * BP + 18;
  const TOP = 46;
  const GRID = N * PITCH - GAP;
  const gridBottom = TOP + GRID;
  const chainTop = gridBottom + 18;
  const resultY = chainTop + (N - 1) * VP + 14;
  const W = LEFT + GRID + 16;
  const H = resultY + RH + 30;
  const cx = (j: number) => LEFT + j * PITCH;
  const cy = (i: number) => TOP + i * PITCH;

  /** which row of A (colour) is carried by a value that entered the array `delta` cycles ago */
  const waveAt = (delta: number): number => {
    const k = t - delta;
    return k >= 0 && k < S.length ? S[k].inRow : -1;
  };
  const histA = (i: number, d: number) => (t - d >= 0 ? S[t - d].aIn[i] : 0);
  const histS = (j: number, d: number) => (t - d >= 0 ? S[t - d].south[j] : 0);

  const loadedRowsUpTo = s.phase === "LOAD" ? Math.floor(s.wIdx / (N / 4)) : N; // row being written
  const writingRow = s.wWe ? Math.floor(s.wIdx / (N / 4)) : -1;
  void loadedRowsUpTo;

  const box = (x: number, y: number, w: number, h: number, wave: number, text: number | string, key: string, fs = 12) => {
    const on = wave >= 0;
    return (
      <g key={key}>
        <rect x={x} y={y} width={w} height={h} rx={4}
          fill={on ? waveSoft(wave) : "var(--pe-idle)"}
          stroke={on ? waveColor(wave) : "var(--border)"} strokeWidth={on ? 1.6 : 1}
          style={{ transition: "fill 150ms, stroke 150ms" }} />
        <text x={x + w / 2} y={y + h / 2 + fs * 0.35} textAnchor="middle" fontSize={fs} fontFamily={MONO}
          fontWeight={on ? 700 : 400} fill={on ? waveColor(wave) : "var(--muted-foreground)"}>{text}</text>
      </g>
    );
  };

  const arrowH = (x1: number, x2: number, y: number, wave: number, key: string) => {
    const on = wave >= 0, c = on ? waveColor(wave) : "var(--muted-foreground)";
    return (
      <g key={key} opacity={on ? 1 : 0.28} stroke={c} fill={c}>
        <line x1={x1} y1={y} x2={x2 - 5} y2={y} strokeWidth={on ? 2.5 : 1} />
        <polygon points={`${x2 - 7},${y - 4} ${x2},${y} ${x2 - 7},${y + 4}`} stroke="none" />
      </g>
    );
  };
  const arrowV = (x: number, y1: number, y2: number, wave: number, key: string) => {
    const on = wave >= 0, c = on ? waveColor(wave) : "var(--muted-foreground)";
    return (
      <g key={key} opacity={on ? 1 : 0.28} stroke={c} fill={c}>
        <line x1={x} y1={y1} x2={x} y2={y2 - 5} strokeWidth={on ? 2.5 : 1} />
        <polygon points={`${x - 4},${y2 - 7} ${x},${y2} ${x + 4},${y2 - 7}`} stroke="none" />
      </g>
    );
  };

  const els: React.ReactNode[] = [];

  // ---- headings
  els.push(
    <text key="h-in" x={feedX} y={18} fontSize={11} fontFamily={MONO} fill="var(--muted-foreground)">A in</text>,
    <text key="h-in2" x={feedX} y={31} fontSize={9} fontFamily={MONO} fill="var(--muted-foreground)">(one row per step)</text>,
  );

  // ---- input skew chains + feed tokens
  for (let i = 0; i < N; i++) {
    const y = cy(i) + CELL / 2 - BH / 2;
    const wFeed = s.inRow;
    els.push(box(feedX, y, BW, BH, wFeed, s.inValid ? s.aIn[i] : 0, `feed${i}`));
    // chain stages 1..i, stage i adjacent to the grid
    let prevRight = feedX + BW;
    for (let d = 1; d <= i; d++) {
      const x = feedX + BW + 22 + (d - 1) * BP;
      els.push(arrowH(prevRight + 1, x - 1, cy(i) + CELL / 2, waveAt(d - 1), `sa${i}_${d}`));
      els.push(box(x, y, BW, BH, waveAt(d), histA(i, d), `st${i}_${d}`));
      prevRight = x + BW;
    }
    els.push(arrowH(prevRight + 1, LEFT - 1, cy(i) + CELL / 2, waveAt(i), `sg${i}`));
    els.push(
      <text key={`rl${i}`} x={LEFT - 6} y={cy(i) + 11} textAnchor="end" fontSize={9} fontFamily={MONO}
        fill="var(--muted-foreground)">row {i}</text>,
    );
  }

  // ---- arrows between cells
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N - 1; j++)
      els.push(arrowH(cx(j) + CELL + 1, cx(j + 1) - 1, cy(i) + CELL / 2, waveAt(i + j + 1), `ah${i}_${j}`));
  for (let i = 0; i < N - 1; i++)
    for (let j = 0; j < N; j++)
      els.push(arrowV(cx(j) + CELL / 2, cy(i) + CELL + 1, cy(i + 1) - 1, waveAt(i + j + 1), `av${i}_${j}`));

  // ---- PE cells
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const idx = i * N + j;
      const wa = waveAt(i + j);        // activation arriving now
      const wp = waveAt(i + j + 1);    // running total held in the cell register
      const w = s.w[idx], a = s.a[idx], ps = s.ps[idx];
      const x = cx(j), y = cy(i);
      const writing = writingRow === i;
      const active = wa >= 0;
      els.push(
        <g key={`pe${idx}`} role="img" aria-label={`cell ${i},${j}: weight ${w}, input ${a}, total ${ps}`}>
          <rect x={x} y={y} width={CELL} height={CELL} rx={7}
            fill={active ? waveSoft(wa) : "var(--pe-idle)"}
            stroke={writing ? "var(--signal-amber)" : active ? waveColor(wa) : "var(--border)"}
            strokeWidth={writing ? 3 : active ? 2 : 1}
            style={{ transition: "fill 150ms, stroke 150ms" }} />
          <text x={x + 7} y={y + 15} fontSize={11} fontFamily={MONO} fill="var(--signal-cyan)" fontWeight={700}>
            {"×"}{w}
            <title>stationary weight (stays in this cell)</title>
          </text>
          {active && (
            <text x={x + CELL - 6} y={y + 15} textAnchor="end" fontSize={11} fontFamily={MONO} fill={waveColor(wa)}>
              in {a}
              <title>number arriving from the left this step</title>
            </text>
          )}
          <text x={x + CELL / 2} y={y + CELL / 2 + 12} textAnchor="middle" fontSize={N <= 4 ? 20 : 15} fontWeight={700}
            fontFamily={MONO} fill={wp >= 0 ? waveColor(wp) : "var(--muted-foreground)"}>
            {ps}
            <title>running total (partial sum) leaving this cell downwards</title>
          </text>
          {active && (
            <text x={x + CELL / 2} y={y + CELL - 8} textAnchor="middle" fontSize={9} fontFamily={MONO}
              fill="var(--muted-foreground)">
              next: {s.psIn[idx]}+{a}{"×"}{w}
            </text>
          )}
        </g>,
      );
    }
  }
  for (let j = 0; j < N; j++)
    els.push(
      <text key={`cl${j}`} x={cx(j) + CELL / 2} y={TOP - 8} textAnchor="middle" fontSize={10} fontFamily={MONO}
        fill="var(--muted-foreground)">col {j}</text>,
    );

  // ---- output de-skew chains + aligned results
  for (let j = 0; j < N; j++) {
    const x = cx(j) + CELL / 2;
    const k = N - 1 - j;                         // delay stages in this column
    let prevY = gridBottom + 1;
    for (let d = 1; d <= k; d++) {
      const y = chainTop + (d - 1) * VP;
      els.push(arrowV(x, prevY, y, waveAt(N + j + d - 1), `oa${j}_${d}`));
      els.push(box(x - RW / 2 + 6, y, RW - 12, BH, waveAt(N + j + d), histS(j, d), `os${j}_${d}`, 11));
      prevY = y + BH;
    }
    els.push(arrowV(x, prevY, resultY - 1, waveAt(2 * N - 1), `og${j}`));
    const on = s.outValid;
    els.push(
      <g key={`res${j}`}>
        <rect x={x - RW / 2} y={resultY} width={RW} height={RH} rx={5}
          fill={on ? waveSoft(s.outRow) : "var(--pe-idle)"}
          stroke={on ? "var(--pe-result)" : "var(--border)"} strokeWidth={on ? 2.5 : 1}
          style={{ transition: "fill 150ms, stroke 150ms" }} />
        <text x={x} y={resultY + RH / 2 + 5} textAnchor="middle" fontSize={13} fontWeight={700} fontFamily={MONO}
          fill={on ? waveColor(s.outRow) : "var(--muted-foreground)"}>{on ? s.cOut[j] : 0}</text>
      </g>,
    );
  }
  els.push(
    <text key="res-h" x={LEFT} y={resultY + RH + 18} fontSize={11} fontFamily={MONO}
      fill={s.outValid ? "var(--pe-result)" : "var(--muted-foreground)"}>
      {s.outValid ? `RESULT ROW ${s.outRow} READY (out_valid = 1)` : "results come out here, aligned as one row (out_valid = 0)"}
    </text>
  );

  return (
    <div className="w-full overflow-x-auto" role="region" aria-label="systolic array animation">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W * 1.25, display: "block", margin: "0 auto" }}>
        {els}
      </svg>
    </div>
  );
}
