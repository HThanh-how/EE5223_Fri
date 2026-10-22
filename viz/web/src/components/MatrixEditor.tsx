/** MatrixEditor - lets the viewer type their own W (N x N) and A (M x N) and re-run the RTL. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { clamp8, type Mat } from "@/lib/npu";

export const DEFAULT_W: Mat = [[1, 0, 2, -1], [3, 1, 0, 2], [-2, 4, 1, 0], [0, 1, -1, 3]];
export const DEFAULT_A: Mat = [[1, 2, 3, 4], [5, 6, 7, 8], [-1, 0, 1, 2], [2, -3, 4, -5]];

const rnd = () => Math.floor(Math.random() * 19) - 9;

function Grid({ label, m, set }: { label: string; m: string[][]; set: (r: number, c: number, v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <table><tbody>
        {m.map((row, r) => (
          <tr key={r}>
            {row.map((v, c) => (
              <td key={c} className="p-0.5">
                <input type="number" min={-128} max={127} value={v} aria-label={`${label} ${r},${c}`}
                  onChange={(e) => set(r, c, e.target.value)}
                  className="w-14 rounded border border-border bg-background px-1 py-1 text-center font-mono text-sm" />
              </td>
            ))}
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}

const toStr = (m: Mat) => m.map((r) => r.map(String));

export function MatrixEditor({ n, onRun }: { n: number; onRun: (A: Mat, W: Mat) => void }) {
  const [W, setW] = useState<string[][]>(toStr(DEFAULT_W));
  const [A, setA] = useState<string[][]>(toStr(DEFAULT_A));
  const num = (m: string[][]): Mat => m.map((r) => r.map((v) => clamp8(Number(v))));
  const setCell = (setter: typeof setW) => (r: number, c: number, v: string) =>
    setter((p) => p.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  const setRows = (k: number) =>
    setA((p) => (k <= p.length ? p.slice(0, k) : [...p, ...Array.from({ length: k - p.length }, () => Array(n).fill("0"))]));

  return (
    <details className="rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">Try your own numbers (INT8: -128 to 127)</summary>
      <div className="mt-4 flex flex-wrap items-start gap-6">
        <Grid label={`W  (${n}x${n} weights)`} m={W} set={setCell(setW)} />
        <Grid label={`A  (${A.length} rows of data)`} m={A} set={setCell(setA)} />
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">Rows of A
            <select className="rounded border border-border bg-background px-1 py-1" value={A.length}
              onChange={(e) => setRows(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <Button onClick={() => onRun(num(A), num(W))}>Run on the RTL</Button>
          <Button variant="outline" onClick={() => {
            setW(Array.from({ length: n }, () => Array.from({ length: n }, () => String(rnd()))));
            setA((p) => p.map(() => Array.from({ length: n }, () => String(rnd()))));
          }}>Random numbers</Button>
          <Button variant="outline" onClick={() => { setW(toStr(DEFAULT_W)); setA(toStr(DEFAULT_A)); }}>Reset example</Button>
        </div>
      </div>
    </details>
  );
}
