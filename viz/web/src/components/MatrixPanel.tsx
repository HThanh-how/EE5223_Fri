/** MatrixPanel - W, A and C matrices next to the grid, reacting to the current cycle, with the reference check. */
import type { RunData } from "@/lib/state-schema";
import { golden, waveColor, type Mat } from "@/lib/npu";

function Cell({ v, dim, color }: { v: number | string; dim?: boolean; color?: string }) {
  return (
    <td className="px-1.5 py-0.5 text-right font-mono text-sm tabular-nums"
      style={{ opacity: dim ? 0.35 : 1, color: color }}>
      {v}
    </td>
  );
}

export function MatrixPanel({ run, t, A, W }: { run: RunData; t: number; A: Mat; W: Mat }) {
  const N = run.n, M = run.m, S = run.states, s = S[t];
  const ref = golden(A, W);
  const s0 = S.findIndex((x) => x.phase !== "LOAD");
  const rowsWritten = s.phase === "LOAD" ? Math.min(N, Math.floor(t / (N / 4))) : N;
  const writing = s.wWe ? Math.floor(s.wIdx / (N / 4)) : -1;
  const got: number[][] = [];
  for (let m = 0; m < M; m++) {
    const cyc = s0 + m + 2 * N - 1;
    if (t >= cyc) got.push(run.result.slice(m * N, (m + 1) * N) as number[]);
  }
  const finished = got.length === M;
  const match = run.result.length === M * N && run.result.every((v, i) => v === ref[Math.floor(i / N)][i % N]);

  const bracket = "border-l-2 border-r-2 border-foreground/40 rounded-sm";
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weights W (stay in the cells)</div>
        <table className={bracket}><tbody>
          {W.map((row, r) => (
            <tr key={r} style={{ outline: writing === r ? "2px solid var(--signal-amber)" : undefined }}>
              {row.map((v, c) => <Cell key={c} v={r < rowsWritten || s.phase !== "LOAD" ? v : "·"} dim={r >= rowsWritten && s.phase === "LOAD"} />)}
            </tr>
          ))}
        </tbody></table>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data A (one row per step)</div>
        <table className={bracket}><tbody>
          {A.map((row, m) => {
            const fed = s.phase !== "LOAD" && (t - s0 >= m);
            const out = t >= s0 + m + 2 * N - 1;
            const now = s.inRow === m;
            return (
              <tr key={m}>
                <td className="w-1.5 p-0" style={{ background: fed || now ? waveColor(m) : "transparent" }} />
                {row.map((v, c) => <Cell key={c} v={v} dim={!fed && !now} color={fed ? waveColor(m) : undefined} />)}
                <td className="pl-2 text-[10px] text-muted-foreground">{now ? "entering" : out ? "done" : fed ? "inside" : "waiting"}</td>
              </tr>
            );
          })}
        </tbody></table>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Result C = A × W (from the RTL)</div>
        <table className={bracket}><tbody>
          {Array.from({ length: M }, (_, m) => {
            const have = m < got.length;
            return (
              <tr key={m}>
                <td className="w-1.5 p-0" style={{ background: have ? waveColor(m) : "transparent" }} />
                {Array.from({ length: N }, (_, c) => (
                  <Cell key={c} v={have ? got[m][c] : "?"} dim={!have} color={have ? waveColor(m) : undefined} />
                ))}
              </tr>
            );
          })}
        </tbody></table>
        <div className="mt-2" data-testid="match-badge" data-match={finished ? String(match) : "pending"}>
          {!finished ? (
            <span className="inline-block rounded border border-border px-2 py-1 text-xs text-muted-foreground">
              reference check: waiting for all {M} rows ({got.length}/{M})
            </span>
          ) : match ? (
            <span className="inline-block rounded border-2 px-2 py-1 text-sm font-bold"
              style={{ borderColor: "var(--pe-result)", color: "var(--pe-result)" }}>
              {"✓"} Matches the reference (A × W computed independently in the page)
            </span>
          ) : (
            <span className="inline-block rounded border-2 px-2 py-1 text-sm font-bold"
              style={{ borderColor: "var(--destructive)", color: "var(--destructive)" }}>
              {"✗"} MISMATCH with the reference
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
