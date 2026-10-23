/** App - page shell: branding, tabs, caption bar, animation, matrices, controls, attribution. */
import { lazy, Suspense, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useNpuViz } from "@/hooks/useNpuViz";
import { PEGrid } from "@/components/PEGrid";
import { Caption } from "@/components/Caption";
import { Controls } from "@/components/Controls";
import { MatrixPanel } from "@/components/MatrixPanel";
import { MatrixEditor, DEFAULT_A, DEFAULT_W } from "@/components/MatrixEditor";
import { CnnLstm } from "@/components/CnnLstm";
import type { Mat } from "@/lib/npu";

// 3D view: Three.js is only downloaded when the tab is opened (still bundled locally, no CDN)
const View3D = lazy(() => import("@/components/View3D"));
type Tab = "array" | "nets" | "3d";

function toggleTheme() {
  const el = document.documentElement;
  const next = el.getAttribute("data-theme") === "light" ? "dark" : "light";
  el.setAttribute("data-theme", next);
  try { localStorage.setItem("npu-theme", next); } catch { /* ignore */ }
}

export default function App() {
  const v = useNpuViz(DEFAULT_A, DEFAULT_W);
  const [tab, setTab] = useState<Tab>(() => (typeof window !== "undefined" && window.location.hash === "#3d" ? "3d" : "array"));
  const [mats, setMats] = useState<{ A: Mat; W: Mat }>({ A: DEFAULT_A, W: DEFAULT_W });
  const s = v.run?.states[v.t];

  const tabBtn = (id: Tab, label: string) => (
    <button key={id} onClick={() => setTab(id)} role="tab" aria-selected={tab === id}
      className={"rounded-md px-4 py-2 text-sm font-semibold transition-colors " +
        (tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>{label}</button>
  );

  return (
    <div className="relative z-10 mx-auto flex min-h-screen w-[min(1180px,100%-24px)] flex-col gap-5 py-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[0.7rem] uppercase tracking-widest text-[var(--signal-lime)]">EE5223 {"·"} our own chip design {"·"} live demo</div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-4xl">An INT8 matrix engine, cycle by cycle</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            A 4{"×"}4 weight-stationary systolic array {"–"} the multiply-add engine at the heart of an AI accelerator.
            Everything on this page is computed by our real SystemVerilog design (<code>sa_top</code>), compiled with Verilator
            to WebAssembly and running in your browser.
          </p>
        </div>
        <button onClick={toggleTheme} className="theme-btn" aria-label="Toggle light/dark theme" title="Toggle theme">
          <Sun className="h-4 w-4" /><Moon className="ml-1 h-4 w-4" />
        </button>
      </header>

      <div role="tablist" className="flex gap-2">
        {tabBtn("array", "The array, step by step")}
        {tabBtn("nets", "Same array: CNN and LSTM")}
        {tabBtn("3d", "3D view")}
      </div>

      {v.error && <pre className="rounded border border-[var(--destructive)] p-4 text-sm text-[var(--destructive)]">Could not run the RTL: {v.error}</pre>}
      {!v.run && !v.error && <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">Loading the RTL simulation {"…"}</div>}

      {v.run && tab === "array" && s && (
        <>
          <Caption run={v.run} t={v.t} />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-lg border border-border bg-card p-3">
              <PEGrid run={v.run} t={v.t} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2 text-[11px] text-muted-foreground">
                <span><b style={{ color: "var(--signal-cyan)" }}>{"×"}3</b> weight stored in the cell</span>
                <span><b>big number</b> running total passed down</span>
                <span>each colour = one row of A travelling through</span>
                <span className="font-mono">cycle {s.cycle} {"·"} {s.phase}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <MatrixPanel run={v.run} t={v.t} A={mats.A} W={mats.W} />
            </div>
          </div>
          <Controls t={v.t} total={v.total} playing={v.playing} speed={v.speed}
            onToggle={v.toggle} onStepForward={v.stepForward} onStepBack={v.stepBack}
            onReset={v.reset} onScrub={v.scrub} onSpeedChange={v.setSpeed} />
          <MatrixEditor n={v.run.n} onRun={(A, W) => { setMats({ A, W }); v.execute(A, W, true); }} />
        </>
      )}
      {v.run && tab === "nets" && <CnnLstm />}
      {v.run && tab === "3d" && (
        <Suspense fallback={<div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">Loading the 3D view {"…"}</div>}>
          <View3D run={v.run} A={mats.A} W={mats.W} onNav={setTab} />
        </Suspense>
      )}

      <footer className="mt-auto border-t border-border pt-4 text-xs text-muted-foreground">
        Hardware: EE5223 project RTL (<code>sa_top</code>, <code>pe</code>, <code>delay</code>), unmodified, wrapped by <code>viz_top</code> for observation.
        Animation framework and PE-grid styling adapted from{" "}
        <a className="underline" href="https://github.com/deaneeth/tiny-tpu" target="_blank" rel="noopener noreferrer">tiny-tpu</a>{" "}
        by Dineth Hettiarachchi (MIT License).
      </footer>
    </div>
  );
}
