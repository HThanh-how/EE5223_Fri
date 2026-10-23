# Third-party material

## tiny-tpu (MIT)

The browser animation reuses the architecture and parts of the front-end of
**tiny-tpu** by Dineth Hettiarachchi - https://github.com/deaneeth/tiny-tpu
(live demo https://tiny-tpu.vercel.app), MIT License, Copyright (c) 2026 Dineth Hettiarachchi.
The full licence text is in `LICENSE.tiny-tpu` (unchanged copy of its `LICENSE`).

What was taken / adapted:

| Our file | Origin |
|---|---|
| `web/package.json`, `pnpm-*`, `tsconfig.json`, `components.json`, `src/components/ui/*`, `src/lib/utils.ts`, `src/styles/global.css` | copied from tiny-tpu `web/` (trimmed / lightly edited) |
| `web/astro.config.mjs`, `web/src/lib/npu.ts` | loader / dev-server pattern adapted from tiny-tpu `astro.config.mjs`, `wasm-loader.ts` |
| `web/src/hooks/useNpuViz.ts` | playback engine adapted from `useTinyTpu.ts` |
| `web/src/components/PEGrid.tsx`, `Controls.tsx` | PE-grid styling and transport bar adapted from tiny-tpu |
| `web/src/lib/state-schema.ts` | per-cycle state contract, structure adapted from `STATE_SCHEMA.md` / `state-schema.ts` |
| `wasm/build.sh` | Verilator -> Emscripten flow adapted from tiny-tpu `wasm/build.sh` |

NOT taken from tiny-tpu: its SystemVerilog (we run our own `sa_top`), its C++ harness logic, its
controller/FSM, landing page, docs and media.

## Other open-source components (installed via npm, see `web/package.json`)

Astro, React, Tailwind CSS, Radix UI slider, framer-motion (declared, unused by our components),
lucide-react, class-variance-authority, clsx, tailwind-merge - all MIT/ISC licensed.
Verilator (LGPL/Artistic) and Emscripten (MIT/UIUC) are build tools; the generated WASM links the
Verilator runtime (`verilated.cpp`).

## Three.js (3D view tab)

The "3D view" tab uses [three](https://github.com/mrdoob/three.js) 0.180.0 (MIT License, Copyright (c) 2010-2025 three.js authors),
installed from the npm registry (`web/package.json`, exact version) and bundled into `web/dist` - no CDN is used at runtime.
Used parts: core, `OrbitControls`, `EffectComposer`/`RenderPass`/`UnrealBloomPass`/`OutputPass`, `RoomEnvironment` (examples/jsm).
