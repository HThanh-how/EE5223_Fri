/**
 * CnnLstm - "same array, other networks": a convolution and one LSTM step are both turned into
 * matrix rows x weights and executed on the SAME RTL (real WASM run, results checked in the page).
 */
import { useMemo, useState } from "react";
import { golden, runNpu, waveColor, waveSoft, type Mat } from "@/lib/npu";

const IMG: Mat = [[1, 2, 0], [0, 3, 1], [2, 1, 4]];
// 4 filters of 2x2, each flattened to one column of W (rows = the 4 positions inside a patch)
const FILTERS: { name: string; k: number[] }[] = [
  { name: "vertical edge", k: [1, -1, 1, -1] },
  { name: "horizontal edge", k: [1, 1, -1, -1] },
  { name: "average", k: [1, 1, 1, 1] },
  { name: "diagonal", k: [1, 0, 0, -1] },
];
const POS: [number, number][] = [[0, 0], [0, 1], [1, 0], [1, 1]];

function Mx({ m, rowColor, hlRow, hlCol }: { m: Mat; rowColor?: (r: number) => string | undefined; hlRow?: number; hlCol?: number }) {
  return (
    <table className="border-l-2 border-r-2 border-foreground/40 rounded-sm"><tbody>
      {m.map((row, r) => (
        <tr key={r} style={{ background: hlRow === r ? waveSoft(r) : undefined }}>
          {rowColor && <td className="w-1.5 p-0" style={{ background: rowColor(r) }} />}
          {row.map((v, c) => (
            <td key={c} className="px-2 py-0.5 text-right font-mono text-sm tabular-nums"
              style={{ background: hlCol === c ? "color-mix(in oklch, var(--signal-cyan) 22%, transparent)" : undefined }}>{v}</td>
          ))}
        </tr>
      ))}
    </tbody></table>
  );
}

function Check({ ok }: { ok: boolean }) {
  return (
    <span className="inline-block rounded border px-2 py-0.5 text-xs font-bold"
      style={{ borderColor: ok ? "var(--pe-result)" : "var(--destructive)", color: ok ? "var(--pe-result)" : "var(--destructive)" }}>
      {ok ? "✓ RTL result matches the reference" : "✗ mismatch"}
    </span>
  );
}

export function CnnLstm() {
  const [p, setP] = useState(0);
  const cnn = useMemo(() => {
    const A: Mat = POS.map(([r, c]) => [IMG[r][c], IMG[r][c + 1], IMG[r + 1][c], IMG[r + 1][c + 1]]);
    const W: Mat = [0, 1, 2, 3].map((r) => FILTERS.map((f) => f.k[r]));
    const run = runNpu(A, W);
    const C: Mat = [0, 1, 2, 3].map((m) => run.result.slice(m * 4, m * 4 + 4) as number[]);
    return { A, W, C, ok: JSON.stringify(C) === JSON.stringify(golden(A, W)) };
  }, []);
  const lstm = useMemo(() => {
    const x = [2, -1], h = [3, 1];
    const A: Mat = [[...x, ...h]];
    const W: Mat = [[1, 2, 0, 1], [0, -1, 1, 2], [2, 1, -1, 0], [1, 0, 3, -2]];
    const run = runNpu(A, W);
    const C: Mat = [run.result.slice(0, 4) as number[]];
    return { x, h, A, W, C, ok: JSON.stringify(C) === JSON.stringify(golden(A, W)) };
  }, []);
  const [pr, pc] = POS[p];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">Convolution (CNN): sliding patches become matrix rows</h2>
        <p className="mt-2 text-muted-foreground">
          A convolution slides a small window over the picture. Instead of building a second kind of hardware, we copy each
          window out as one row of numbers (this trick is called im2col). Each filter becomes one column of the weight
          table. Now the whole convolution is exactly the same {"“"}rows {"×"} weights{"”"} job the array already does.
          The result below was produced by the RTL.
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-8">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Picture 3x3</div>
            <table><tbody>
              {IMG.map((row, r) => (
                <tr key={r}>
                  {row.map((v, c) => {
                    const inside = r >= pr && r <= pr + 1 && c >= pc && c <= pc + 1;
                    return <td key={c} className="h-10 w-10 border border-border text-center font-mono"
                      style={{ background: inside ? waveSoft(p) : undefined, color: inside ? waveColor(p) : undefined, fontWeight: inside ? 700 : 400 }}>{v}</td>;
                  })}
                </tr>
              ))}
            </tbody></table>
            <div className="mt-2 flex gap-1">
              {POS.map((_, i) => (
                <button key={i} onClick={() => setP(i)} className="rounded border px-2 py-1 text-xs font-mono"
                  style={{ borderColor: waveColor(i), background: p === i ? waveSoft(i) : undefined }}>patch {i}</button>
              ))}
            </div>
          </div>
          <div className="self-center text-2xl text-muted-foreground">{"→"}</div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">A: one patch per row</div>
            <Mx m={cnn.A} rowColor={(r) => waveColor(r)} hlRow={p} />
          </div>
          <div className="self-center text-2xl text-muted-foreground">{"×"}</div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">W: one filter per column</div>
            <Mx m={cnn.W} />
            <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
              {FILTERS.map((f) => <span key={f.name} className="w-12 leading-tight">{f.name}</span>)}
            </div>
          </div>
          <div className="self-center text-2xl text-muted-foreground">=</div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">C: result (row = patch, column = filter)</div>
            <Mx m={cnn.C} rowColor={(r) => waveColor(r)} hlRow={p} />
            <div className="mt-2"><Check ok={cnn.ok} /></div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-xl font-bold sm:text-2xl">LSTM: one time step is one row {"×"} one weight table</h2>
        <p className="mt-2 text-muted-foreground">
          An LSTM cell remembers the past in a small vector h. At each time step we glue the new input x and the old memory h
          side by side into one row, and multiply it by a weight table whose four columns are the four {"“"}gates{"”"}{" "}
          (input, forget, candidate, output). Again: one row {"×"} weights, done by the same array. The gate totals below came
          from the RTL; the system then squashes them with sigmoid/tanh look-up tables (not part of this array).
        </p>
        <div className="mt-4 flex flex-wrap items-start gap-8">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">[ x_t | h_(t-1) ]</div>
            <table><tbody><tr>
              {lstm.x.map((v, i) => <td key={"x" + i} className="h-10 w-10 border text-center font-mono" style={{ borderColor: waveColor(0), background: waveSoft(0) }}>{v}</td>)}
              {lstm.h.map((v, i) => <td key={"h" + i} className="h-10 w-10 border text-center font-mono" style={{ borderColor: waveColor(3), background: waveSoft(3) }}>{v}</td>)}
            </tr></tbody></table>
            <div className="mt-1 text-[10px] text-muted-foreground">new input | memory</div>
          </div>
          <div className="self-center text-2xl text-muted-foreground">{"×"}</div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">W: one gate per column</div>
            <Mx m={lstm.W} />
            <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
              {["input", "forget", "cand.", "output"].map((g) => <span key={g} className="w-12">{g}</span>)}
            </div>
          </div>
          <div className="self-center text-2xl text-muted-foreground">=</div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">gate totals</div>
            <Mx m={lstm.C} />
            <div className="mt-2"><Check ok={lstm.ok} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}
