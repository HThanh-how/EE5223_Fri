/** Caption - plain-language explanation of what the array is doing in the current cycle. */
import type { RunData } from "@/lib/state-schema";
import { waveColor } from "@/lib/npu";

const STEPS = ["1  Load the weights", "2  Feed the data", "3  Multiply and add", "4  Collect the results"];

export function captionFor(run: RunData, t: number): { step: number; title: string; body: string; now: string } {
  const N = run.n, M = run.m, S = run.states, s = S[t];
  const s0 = S.findIndex((x) => x.phase !== "LOAD");
  const lat = 2 * N - 1;
  if (s.phase === "LOAD") {
    const row = Math.floor(s.wIdx / (N / 4));
    return {
      step: 0,
      title: "Weights are loaded once and stay in the cells",
      body: "Before any data arrives, the table of weights W is written into the grid, one row per step. Every cell keeps its own number and never forgets it – that is why this design is called weight-stationary.",
      now: `Writing weight row ${row + 1} of ${N} (the amber outline).`,
    };
  }
  const k = t - s0;
  if (s.outValid) {
    const done = s.phase === "DONE";
    return {
      step: 3,
      title: done ? `All ${M} result rows are out – C = A × W is complete` : `Result row ${s.outRow} comes out, whole, in a single step`,
      body: `The totals reach the bottom at different times, so short waiting lines line them up. Row ${s.outRow} of the answer appears ${lat} = 2×${N}−1 steps after row ${s.outRow} of A entered – the array's fixed latency.`,
      now: done ? "Compare with the reference on the right: the numbers are checked against a plain matrix multiply." : `${s.outRow + 1} of ${M} result rows collected.`,
    };
  }
  if (s.phase === "DRAIN") {
    return {
      step: 3,
      title: "The last totals are travelling down and out",
      body: "No new data enters now. The remaining partial totals keep moving down the columns, and every column waits a different number of steps so the finished results line up into complete rows.",
      now: "Staggered waiting boxes under the grid hold the totals that finished early.",
    };
  }
  // STREAM
  if (k < N) {
    return {
      step: 1,
      title: "Each row of numbers enters one step later than the row above",
      body: `A new row of A is fed in every step, but row 0 goes in at once, row 1 waits one step, row 2 waits two, and so on. This stagger makes the numbers form a diagonal wave, so every number meets exactly the right weight at the right moment.`,
      now: s.inRow >= 0 ? `Row ${s.inRow} of A (colour ${s.inRow + 1}) enters the left edge now.` : "",
    };
  }
  return {
    step: 2,
    title: "Each cell multiplies and adds, passing the running total down",
    body: "A cell multiplies the number that arrives from the left by its stored weight, adds the total handed down from the cell above, and passes the new total to the cell below. The input number also moves one cell to the right. All cells do this at the same time.",
    now: s.inRow >= 0 ? `Row ${s.inRow} of A is still being fed while earlier rows are already being added up.` : "",
  };
}

export function Caption({ run, t }: { run: RunData; t: number }) {
  const c = captionFor(run, t);
  const s = run.states[t];
  const lastFedColor = s.inRow >= 0 ? waveColor(s.inRow) : "var(--muted-foreground)";
  return (
    <div className="rounded-lg border border-border bg-card p-4" aria-live="polite">
      <ol className="mb-3 flex flex-wrap gap-2 text-xs font-mono">
        {STEPS.map((x, i) => (
          <li key={x} className={"rounded-full border px-3 py-1 " + (i === c.step ? "border-primary bg-primary text-primary-foreground font-bold" : "border-border text-muted-foreground")}>
            {x}
          </li>
        ))}
      </ol>
      <h2 className="text-xl font-bold leading-snug sm:text-2xl">{c.title}</h2>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{c.body}</p>
      {c.now && (
        <p className="mt-2 text-sm font-medium" style={{ color: lastFedColor }}>{"▶ "}{c.now}</p>
      )}
    </div>
  );
}
