/**
 * Controls - play / pause / step / scrub / speed bar.
 * Adapted from tiny-tpu's Controls (MIT, Dineth Hettiarachchi).
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { SPEED_OPTIONS, type SpeedOption } from "@/hooks/useNpuViz";

export interface ControlsProps {
  t: number;
  total: number;
  playing: boolean;
  speed: SpeedOption;
  onToggle: () => void;
  onStepForward: () => void;
  onStepBack: () => void;
  onReset: () => void;
  onScrub: (idx: number) => void;
  onSpeedChange: (s: SpeedOption) => void;
}

export function Controls(p: ControlsProps) {
  const max = Math.max(0, p.total - 1);
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="tabular-nums text-sm font-mono text-muted-foreground">
          Step <span className="text-foreground font-bold">{p.t + 1}</span> / {p.total}
        </span>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">Speed</span>
          {SPEED_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => p.onSpeedChange(s)}
              className={cn("h-7 rounded px-2 text-xs font-mono transition-colors",
                s === p.speed ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
              aria-pressed={s === p.speed} aria-label={`speed ${s}x`}>{s}x</button>
          ))}
        </div>
      </div>
      <Slider min={0} max={max} step={1} value={[p.t]} onValueChange={([v]) => { if (v !== undefined) p.onScrub(v); }}
        aria-label="step scrubber" />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={p.onReset} aria-label="Restart" title="Restart" className="h-9 w-9">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={p.onStepBack} disabled={p.t === 0} aria-label="Step back" title="Step back" className="h-9 w-9">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant={p.playing ? "outline" : "default"} size="icon" onClick={p.onToggle}
          aria-label={p.playing ? "Pause" : "Play"} title={p.playing ? "Pause" : "Play"} className="h-10 w-10">
          {p.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <Button variant="outline" size="icon" onClick={p.onStepForward} disabled={p.t >= max} aria-label="Step forward" title="Step forward" className="h-9 w-9">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="ml-auto hidden items-center gap-0.5 sm:flex" aria-hidden>
          {Array.from({ length: p.total }, (_, i) => (
            <span key={i} className={cn("inline-block h-1.5 w-2 rounded-full",
              i === p.t ? "bg-primary" : i < p.t ? "bg-primary/40" : "bg-muted")} />
          ))}
        </div>
      </div>
    </div>
  );
}
