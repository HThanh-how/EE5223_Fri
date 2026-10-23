/**
 * scene3d.ts - Three.js scene for the "3D view" tab.
 *
 * Everything that moves or changes is a pure function of the (fractional) cycle clock `tf` and of the
 * recorded per-cycle RTL trace (RunData, see state-schema.ts). Nothing is simulated here: the values on
 * the labels (weights, activations, running totals, results) are read from the trace of our real sa_top;
 * only the interpolation between two recorded cycles and the colours are cosmetic.
 *
 * Because update(tf) is deterministic, the same code renders the interactive page and the offline video
 * (frames are produced by stepping tf from a script, not by wall-clock time).
 *
 * Geometry (world units, P = pitch of one PE):
 *   x  -> columns of the array (j), also the direction the INT8 activations travel (left -> right)
 *   z  -> rows of the array (i) and the direction the partial sums travel (towards the viewer)
 *   y  -> up; PE bar height = |current partial sum| held in that PE
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { RunData } from "./state-schema";

type Mat = number[][];

const P = 1.5; // PE pitch
const Y_A = 2.5; // activation lane height
const Y_P = 2.1; // partial-sum lane height
const Y_LOW = 0.42; // tokens sitting inside delay registers
const PLINTH = 0.46;
const SLOT_S = 0.62; // spacing of the de-skew delay boxes, in row units

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bump = (x: number, w: number) => Math.max(0, 1 - Math.abs(x) / w);

/** oklch -> THREE.Color (same hue ramp as waveColor() in npu.ts, so 2D and 3D agree) */
function oklch(L: number, C: number, hDeg: number, out: THREE.Color): THREE.Color {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return out.setRGB(clamp(r), clamp(g), clamp(bl), THREE.LinearSRGBColorSpace);
}
export const waveThree = (m: number, out = new THREE.Color()) => oklch(0.78, 0.16, (25 + m * 47) % 360, out);
export const waveCss = (m: number) => `oklch(0.78 0.16 ${(25 + m * 47) % 360})`;

// ---------------------------------------------------------------- label textures
const texCache = new Map<string, THREE.CanvasTexture>();
function labelTex(text: string, color: string, w = 256, h = 128, fontPx = 64, bg = true, border = true): THREE.CanvasTexture {
  const key = `${text}|${color}|${w}|${h}|${fontPx}|${bg}|${border}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const r = h * 0.28;
  if (bg) {
    g.fillStyle = "rgba(7,11,20,0.78)";
    g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, r); g.fill();
    if (border) { g.strokeStyle = color; g.globalAlpha = 0.85; g.lineWidth = 4; g.stroke(); g.globalAlpha = 1; }
  }
  const fam = `ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace`;
  g.font = `700 ${fontPx}px ${fam}`;
  while (g.measureText(text).width > w * 0.92 && fontPx > 12) { fontPx -= 4; g.font = `700 ${fontPx}px ${fam}`; }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2 + fontPx * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function makeSprite(scaleX: number, scaleY: number): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.set(scaleX, scaleY, 1);
  return s;
}
function setSprite(s: THREE.Sprite, text: string, color: string, w = 256, h = 128, fontPx = 64) {
  const mat = s.material as THREE.SpriteMaterial;
  mat.map = labelTex(text, color, w, h, fontPx);
  mat.needsUpdate = true;
}

export type PoseName = "iso" | "top" | "side" | "low" | "close";

export interface Scene3DOptions { bloom?: boolean; shadows?: boolean; maxPixelRatio?: number }

export class Scene3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private canvas: HTMLCanvasElement;
  private opts: Required<Scene3DOptions>;

  cinematic = false;
  /** shifts the picture up (fraction of the height) so the HUD at the bottom does not hide the scene */
  viewOffsetY = 0.1;
  labelsOn = true;
  private bloomOn: boolean;

  // run data
  private run: RunData | null = null;
  private A: Mat = [];
  private N = 4; private M = 4;
  private s0 = 0; private kEnter: number[] = []; private loadCycle: number[] = [];
  private maxPs = 1; private maxPos = 1; private maxNeg = 0; private y0 = 0.1; private barK = 1;
  /** last cycle index of the trace (last result row is out) */
  tLast = 0;
  /** clock value at which the final animation (bars green, badge) is complete */
  tEnd = 0;
  /** clock value at which the final "all green / matches" state starts */
  tGreen = 0;
  private root = new THREE.Group();

  // per-run objects
  private pe: { plinth: THREE.Mesh; bar: THREE.Mesh; barMat: THREE.MeshStandardMaterial; gem: THREE.Mesh; gemMat: THREE.MeshStandardMaterial;
    wLabel: THREE.Mesh; psLabel: THREE.Sprite; x: number; z: number }[] = [];
  private aTok: { mesh: THREE.Mesh; label: THREE.Sprite; m: number; i: number }[] = [];
  private pTok: { mesh: THREE.Mesh; label: THREE.Sprite; m: number; j: number }[] = [];
  private bars: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; label: THREE.Sprite; ped: THREE.Mesh; m: number; j: number }[] = [];
  private trayMats: THREE.MeshStandardMaterial[] = [];
  private sceneLabels: THREE.Sprite[] = [];
  private tmpC = new THREE.Color();
  private tmpC2 = new THREE.Color();
  private idleC = new THREE.Color(0x1d2a44);
  private greenC = new THREE.Color(0x35e08a);
  private cyanC = new THREE.Color(0x35d4ff);
  private amberC = new THREE.Color(0xffb83d);
  private keyLight!: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement, options: Scene3DOptions = {}) {
    this.canvas = canvas;
    this.opts = { bloom: options.bloom ?? true, shadows: options.shadows ?? true, maxPixelRatio: options.maxPixelRatio ?? 2 };
    this.bloomOn = this.opts.bloom;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.opts.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x070b14, 1);

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 40;

    this.scene.background = new THREE.Color(0x070b14);
    this.scene.fog = new THREE.Fog(0x070b14, 28, 70);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.05).texture;
    this.scene.environmentIntensity = 0.32;
    pm.dispose();

    this.scene.add(new THREE.HemisphereLight(0x8aa8ff, 0x0b1020, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.1);
    key.position.set(-6, 14, 9);
    key.castShadow = this.opts.shadows;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 16; key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03; key.shadow.radius = 4;
    key.target.position.set(0, 0, 3);
    this.scene.add(key, key.target);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight(0x5aa0ff, 0.9);
    rim.position.set(8, 6, -8);
    this.scene.add(rim);

    this.scene.add(this.root);
    this.setupComposer();
    this.resize();
    this.setPose("iso");
  }

  private setupComposer() {
    if (!this.bloomOn) { this.composer = null; this.bloomPass = null; return; }
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(size, 0.55, 0.55, 0.92);
    composer.addPass(this.bloomPass);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  setBloom(on: boolean) {
    if (on === this.bloomOn) return;
    this.bloomOn = on;
    this.composer?.dispose();
    this.setupComposer();
    this.resize();
  }
  get bloom() { return this.bloomOn; }

  resize() {
    const w = Math.max(2, this.canvas.clientWidth), h = Math.max(2, this.canvas.clientHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.opts.maxPixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole scene in view on narrow windows
    this.camera.fov = w / h < 1.4 ? 46 : 38;
    this.camera.setViewOffset(w, h, 0, Math.round(h * this.viewOffsetY), w, h);
    this.camera.updateProjectionMatrix();
    this.composer?.setPixelRatio(pr);
    this.composer?.setSize(w, h);
  }

  // ---------------------------------------------------------------- world helpers
  private cx(c: number) { return (c - (this.N - 1) / 2) * P; }
  private cz(r: number) { return (r - (this.N - 1) / 2) * P; }
  private get trayZ() { return this.N - 1 + 0.95 + SLOT_S * (this.N - 1); }
  /** the output chart sits to the right of the array: rows of C along z, columns along x */
  private chartX(j: number) { return this.cx(this.N - 1) + 3.0 + j * 1.5; }
  private chartZ(m: number) { return this.cz(this.trayZ - 1.0 + 0.85 * m); }

  // ---------------------------------------------------------------- build scene for a run
  private disposeRun() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !(m.userData.sharedGeo)) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => { if (!x.userData.shared) x.dispose(); });
    });
    this.root.clear();
    this.pe = []; this.aTok = []; this.pTok = []; this.bars = []; this.trayMats = []; this.sceneLabels = [];
  }

  setRun(run: RunData, A: Mat, W: Mat) {
    void W;
    this.disposeRun();
    this.run = run; this.A = A;
    const N = (this.N = run.n), M = (this.M = run.m), S = run.states;
    this.s0 = Math.max(0, S.findIndex((x) => x.phase !== "LOAD"));
    this.kEnter = Array.from({ length: M }, (_, m) => { const k = S.findIndex((x) => x.inRow === m); return k >= 0 ? k : this.s0 + m; });
    this.tLast = S.length - 1;
    this.tGreen = this.kEnter[M - 1] + 2 * N - 1 + 1.6;
    this.tEnd = this.tGreen + 2.2;
    const wpr = Math.max(1, N / 4);
    this.loadCycle = Array.from({ length: N }, (_, i) => {
      const k = S.findIndex((x) => x.wWe && Math.floor(x.wIdx / wpr) === i);
      return k >= 0 ? k : i;
    });
    this.maxPs = 1;
    for (const s of S) for (const v of s.ps) this.maxPs = Math.max(this.maxPs, Math.abs(v));
    this.maxPos = 1; this.maxNeg = 0;
    for (const v of run.result) { this.maxPos = Math.max(this.maxPos, v); this.maxNeg = Math.max(this.maxNeg, -v); }
    this.barK = 2.3 / (this.maxPos + this.maxNeg);
    this.y0 = 0.12 + this.maxNeg * this.barK;

    // ---- plate
    const xMin = this.cx(-N + 0.3) - 0.6, xMax = this.chartX(N - 1) + 1.3;
    const zMin = this.cz(-1.6), zMax = Math.max(this.cz(this.trayZ) + 1.3, this.chartZ(M - 1) + 1.1);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(xMax - xMin, 0.3, zMax - zMin),
      new THREE.MeshStandardMaterial({ color: 0x0c1322, roughness: 0.55, metalness: 0.35 }),
    );
    plate.position.set((xMin + xMax) / 2, -0.15, (zMin + zMax) / 2);
    plate.receiveShadow = true;
    this.root.add(plate);
    const grid = new THREE.GridHelper(Math.max(xMax - xMin, zMax - zMin), Math.round(Math.max(xMax - xMin, zMax - zMin) / 0.75), 0x2a3d63, 0x16213a);
    grid.position.set((xMin + xMax) / 2, 0.003, (zMin + zMax) / 2);
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.22;
    grid.scale.set((xMax - xMin) / Math.max(xMax - xMin, zMax - zMin), 1, (zMax - zMin) / Math.max(xMax - xMin, zMax - zMin));
    this.root.add(grid);

    // ---- PE blocks
    const plinthGeo = new THREE.BoxGeometry(1.2, PLINTH, 1.2);
    const barGeo = new THREE.BoxGeometry(0.8, 1, 0.8);
    const gemGeo = new THREE.OctahedronGeometry(0.13, 0);
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x1a2640, roughness: 0.38, metalness: 0.55 });
    plinthMat.userData.shared = true;
    const wGeo = new THREE.PlaneGeometry(0.9, 0.39);
    for (const g of [plinthGeo, barGeo, gemGeo, wGeo]) g.userData = { shared: true };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = this.cx(j), z = this.cz(i);
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.set(x, PLINTH / 2, z); plinth.castShadow = true; plinth.receiveShadow = true; plinth.userData.sharedGeo = true;
      const barMat = new THREE.MeshStandardMaterial({ color: this.idleC, roughness: 0.28, metalness: 0.25, emissive: 0x000000 });
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.castShadow = true; bar.receiveShadow = true; bar.userData.sharedGeo = true;
      const gemMat = new THREE.MeshStandardMaterial({ color: 0x0a2430, emissive: this.cyanC, emissiveIntensity: 0, roughness: 0.2, metalness: 0.1 });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.userData.sharedGeo = true;
      const wLabel = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
      wLabel.userData.sharedGeo = true;
      wLabel.position.set(x, PLINTH / 2, z + 0.605);
      const psLabel = makeSprite(1.0, 0.5);
      this.root.add(plinth, bar, gem, wLabel, psLabel);
      this.pe.push({ plinth, bar, barMat, gem, gemMat, wLabel, psLabel, x, z });
    }

    // ---- lane rails (very faint)
    const railMat = new THREE.LineBasicMaterial({ color: 0x6ea8ff, transparent: true, opacity: 0.16 });
    const colMat = new THREE.LineBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.14 });
    for (let i = 0; i < N; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(this.cx(-N + 0.5), Y_A, this.cz(i)), new THREE.Vector3(this.cx(N - 0.2), Y_A, this.cz(i))]);
      this.root.add(new THREE.Line(g, railMat));
    }
    for (let j = 0; j < N; j++) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(this.cx(j), Y_P, this.cz(-0.7)), new THREE.Vector3(this.cx(j), Y_P, this.cz(N - 0.8))]);
      this.root.add(new THREE.Line(g, colMat));
    }

    // ---- delay-register ghost boxes: input skew (row i has i boxes) and output de-skew (column j has N-1-j)
    const slotGeo = new THREE.BoxGeometry(0.78, 0.6, 0.78); slotGeo.userData = { shared: true };
    const slotEdge = new THREE.EdgesGeometry(slotGeo); slotEdge.userData = { shared: true };
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x20345c, transparent: true, opacity: 0.28, roughness: 0.3, metalness: 0.2, depthWrite: false });
    slotMat.userData.shared = true;
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6f93d6, transparent: true, opacity: 0.55 }); edgeMat.userData.shared = true;
    const addSlot = (x: number, z: number) => {
      const b = new THREE.Mesh(slotGeo, slotMat); b.position.set(x, 0.3, z); b.userData.sharedGeo = true;
      const e = new THREE.LineSegments(slotEdge, edgeMat); e.position.copy(b.position);
      this.root.add(b, e);
    };
    for (let i = 1; i < N; i++) for (let c = -i; c <= -1; c++) addSlot(this.cx(c), this.cz(i));
    for (let j = 0; j < N; j++) {
      const D = N - 1 - j;
      for (let d = 0; d < D; d++) addSlot(this.cx(j), this.cz(this.trayZ - (D - d) * SLOT_S));
    }
    // result tray
    const trayGeo = new THREE.BoxGeometry(1.25, 0.1, 0.95); trayGeo.userData = { shared: true };
    for (let j = 0; j < N; j++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x16314a, emissive: 0x35e08a, emissiveIntensity: 0, roughness: 0.3, metalness: 0.4 });
      const t = new THREE.Mesh(trayGeo, mat); t.position.set(this.cx(j), 0.05, this.cz(this.trayZ)); t.userData.sharedGeo = true;
      t.receiveShadow = true;
      this.root.add(t); this.trayMats.push(mat);
    }

    // ---- tokens
    const sphereGeo = new THREE.SphereGeometry(0.2, 28, 18); sphereGeo.userData = { shared: true };
    const cubeGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34); cubeGeo.userData = { shared: true };
    const tokMats = Array.from({ length: M }, (_, m) => {
      const c = waveThree(m);
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.1 });
      mat.userData.shared = true;
      return mat;
    });
    for (let m = 0; m < M; m++) {
      for (let i = 0; i < N; i++) {
        const mesh = new THREE.Mesh(sphereGeo, tokMats[m]); mesh.userData.sharedGeo = true; mesh.castShadow = true;
        const label = makeSprite(0.8, 0.4);
        this.root.add(mesh, label);
        this.aTok.push({ mesh, label, m, i });
      }
      for (let j = 0; j < N; j++) {
        const mesh = new THREE.Mesh(cubeGeo, tokMats[m]); mesh.userData.sharedGeo = true; mesh.castShadow = true;
        const label = makeSprite(0.86, 0.43);
        this.root.add(mesh, label);
        this.pTok.push({ mesh, label, m, j });
      }
    }

    // ---- C chart
    const pedGeo = new THREE.BoxGeometry(1.15, 1, 1.0); pedGeo.userData = { shared: true };
    const bGeo = new THREE.BoxGeometry(0.82, 1, 0.72); bGeo.userData = { shared: true };
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, transparent: true, opacity: 0.2, roughness: 0.7, metalness: 0.05, depthWrite: false });
    pedMat.userData.shared = true;
    for (let m = 0; m < M; m++) for (let j = 0; j < N; j++) {
      const x = this.chartX(j), z = this.chartZ(m);
      const ped = new THREE.Mesh(pedGeo, pedMat); ped.userData.sharedGeo = true;
      ped.scale.y = this.y0; ped.position.set(x, this.y0 / 2, z);
      const mat = new THREE.MeshStandardMaterial({ color: waveThree(m), roughness: 0.22, metalness: 0.2, emissive: waveThree(m), emissiveIntensity: 0.0 });
      const mesh = new THREE.Mesh(bGeo, mat); mesh.userData.sharedGeo = true; mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.visible = false;
      const label = makeSprite(1.1, 0.55); label.visible = false;
      this.root.add(ped, mesh, label);
      this.bars.push({ mesh, mat, label, ped, m, j });
    }

    // ---- floor captions in the scene
    const cap = (text: string, x: number, y: number, z: number, sx: number, color = "#9fb4d8") => {
      const s = makeSprite(sx, sx * 0.25);
      (s.material as THREE.SpriteMaterial).map = labelTex(text, color, 1024, 256, 96, false);
      s.position.set(x, y, z);
      this.root.add(s); this.sceneLabels.push(s);
    };
    cap("A in (skewed)", this.cx(-N / 2 - 0.2), 1.0, this.cz(-0.95), 3.2, "#8fc1ff");
    cap("weights stay in the blocks", this.cx((N - 1) / 2), 0.9, this.cz(-1.15), 4.6, "#35d4ff");
    cap("running sums flow down", this.cx(N - 1) + 1.9, 1.3, this.cz(0.6), 3.8, "#ffb86b");
    cap("output de-skew", this.cx(-1.2), 0.8, this.cz(N + 0.3), 3.0, "#8fc1ff");
    cap("C = A x W  (output)", this.chartX((N - 1) / 2), this.y0 + 3.2, this.chartZ(-0.5), 4.2, "#9bf0c0");

    this.keyLight.target.position.set(0, 0, this.cz(N / 2));
    this.setLabelsOn(this.labelsOn);
    if (!this.cinematic) this.setPose("iso"); // framing depends on the number of rows of A
    this.update(0);
  }

  setLabelsOn(on: boolean) {
    this.labelsOn = on;
    for (const s of this.sceneLabels) s.visible = on;
  }

  // ---------------------------------------------------------------- partial-sum path below the grid
  /** waypoints [delta, z(row units), y] for column j: through the grid, then hop through its D delay boxes to the tray */
  private psumPath(j: number): [number, number, number][] {
    const N = this.N, D = N - 1 - j;
    const pts: [number, number, number][] = [[N - 1 + j, N - 1, Y_P]];
    for (let d = 0; d <= D; d++) pts.push([N + j + d, this.trayZ - (D - d) * SLOT_S, Y_LOW + 0.1]);
    return pts;
  }

  // ---------------------------------------------------------------- per-frame update
  /** Set the whole scene to cycle-clock value tf (fractional cycles). Deterministic. */
  update(tfIn: number) {
    const run = this.run;
    if (!run) return;
    const N = this.N, M = this.M, S = run.states;
    const tf = clamp(tfIn, 0, this.tEnd);
    /** the cinematic camera may run a few cycles before the start and after the end (establishing / outro shots) */
    const tfCam = clamp(tfIn, -3, this.tEnd + 4);
    const t0 = Math.min(S.length - 1, Math.floor(tf)), t1 = Math.min(S.length - 1, t0 + 1);
    const f = tf - Math.floor(tf);
    const fs = sstep(0, 1, f);
    const s0n = S[t0];
    const inDone = tf >= this.tGreen;
    const doneK = sstep(this.tGreen - 0.1, this.tGreen + 0.9, tf);

    // ---------------- PE blocks
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const idx = i * N + j, pe = this.pe[idx];
      let act = 0, actM = -1, lastM = -1;
      for (let m = 0; m < M; m++) {
        const tc = this.kEnter[m] + i + j;
        const b = bump(tf - (tc + 0.3), 0.85);
        if (b > act) { act = b; actM = m; }
        if (tf >= tc + 1) lastM = m;
      }
      const hv = lerp(Math.abs(S[t0].ps[idx]), Math.abs(S[t1].ps[idx]), fs);
      const h = 0.04 + 1.05 * (hv / this.maxPs);
      pe.bar.scale.y = h; pe.bar.position.set(pe.x, PLINTH + h / 2, pe.z);
      if (lastM >= 0 || actM >= 0) {
        const mm = lastM >= 0 ? lastM : actM;
        waveThree(mm, this.tmpC);
        pe.barMat.color.copy(this.idleC).lerp(this.tmpC, 0.78);
        pe.barMat.emissive.copy(this.tmpC);
        pe.barMat.emissiveIntensity = 0.12 + 0.95 * act;
        if (actM >= 0 && act > 0.05) { waveThree(actM, this.tmpC2); pe.barMat.emissive.lerp(this.tmpC2, act); }
      } else {
        pe.barMat.color.copy(this.idleC); pe.barMat.emissive.setRGB(0, 0, 0); pe.barMat.emissiveIntensity = 0;
      }
      // weight gem and its label (state-driven: appears when row i has been written in LOAD)
      const lc = this.loadCycle[i];
      const lk = clamp(tf - lc, 0, 1);
      const loaded = tf >= lc;
      const wv = S[Math.max(this.s0, 0)].w[idx];
      const gemY = PLINTH + 0.15 + (1 - sstep(0, 1, lk)) * 1.5 + 0.03 * Math.sin(tf * 2.4 + idx);
      pe.gem.visible = loaded;
      pe.gem.position.set(pe.x, gemY, pe.z + 0.5);
      pe.gem.rotation.y = tf * 1.1 + idx;
      const writing = (s0n.wWe && Math.floor(s0n.wIdx / Math.max(1, N / 4)) === i && s0n.phase === "LOAD");
      pe.gemMat.emissiveIntensity = 1.2 + 1.6 * (writing ? 1 : 0) + 0.5 * act;
      pe.gemMat.emissive.copy(this.cyanC).lerp(this.amberC, writing ? 1 - lk : 0);
      pe.wLabel.visible = loaded && lk > 0.5;
      if (pe.wLabel.visible) {
        const mat = pe.wLabel.material as THREE.MeshBasicMaterial;
        const tx = labelTex(`w = ${wv}`, "#5fe0ff", 256, 112, 76, true, false);
        if (mat.map !== tx) { mat.map = tx; mat.needsUpdate = true; }
      }
      // running-total label above the bar
      const sv = S[tf - Math.floor(tf) > 0.5 ? t1 : t0].ps[idx];
      pe.psLabel.visible = this.labelsOn && tf >= this.s0 && (act > 0.02 || sv !== 0 || hv > 0.5);
      if (pe.psLabel.visible) {
        pe.psLabel.position.set(pe.x, PLINTH + h + 0.34, pe.z);
        setSprite(pe.psLabel, `${sv}`, lastM >= 0 ? waveCss(lastM) : "#b9c7e6", 256, 128, 66);
      }
    }

    // ---------------- activation tokens (spheres, travel in +x)
    for (const tk of this.aTok) {
      const { m, i } = tk;
      const d = tf - this.kEnter[m];
      const vis = d > -0.6 && d < i + N - 1 + 0.6;
      tk.mesh.visible = vis; tk.label.visible = vis && this.labelsOn;
      if (!vis) continue;
      const c = d - i;
      const sc = sstep(-0.6, -0.2, d) * (1 - sstep(i + N - 1 + 0.1, i + N - 1 + 0.6, d));
      let y = lerp(Y_LOW, Y_A, sstep(-1.0, -0.1, c));
      if (c >= -0.15 && c <= N - 1 + 0.15) y -= 0.72 * bump(c - Math.round(clamp(c, 0, N - 1)), 0.5);
      tk.mesh.position.set(this.cx(c), y, this.cz(i));
      tk.mesh.scale.setScalar(Math.max(0.001, sc));
      tk.label.position.set(this.cx(c), y + 0.42, this.cz(i));
      tk.label.scale.set(0.8 * sc, 0.4 * sc, 1);
      const v = S[Math.min(S.length - 1, this.kEnter[m])].aIn[i];
      setSprite(tk.label, `${v}`, waveCss(m), 256, 128, 66);
    }

    // ---------------- partial-sum tokens (cubes, travel in +z)
    const tDone = 2 * N - 1;
    for (const tk of this.pTok) {
      const { m, j } = tk;
      const k = this.kEnter[m];
      const d = tf - k;
      const r = d - j;
      const vis = r > -0.6 && d < tDone + 1.05;
      tk.mesh.visible = vis; tk.label.visible = vis && this.labelsOn;
      if (!vis) continue;
      let zIdx: number, y: number;
      if (d >= tDone) {
        // fly from the tray to the bar of the chart
        const u = sstep(0, 1, (d - tDone) / 1.0);
        const bz = this.chartZ(m), bx = this.chartX(j);
        const v = this.run!.result[m * N + j];
        const topY = this.y0 + Math.max(0, v) * this.barK + 0.2;
        const x = lerp(this.cx(j), bx, u);
        const z = lerp(this.cz(this.trayZ), bz, u);
        y = lerp(Y_LOW + 0.1, topY, u) + 1.0 * Math.sin(Math.PI * u);
        tk.mesh.position.set(x, y, z);
        tk.mesh.scale.setScalar(Math.max(0.001, 1 - sstep(0.8, 1.0, u)));
        tk.label.position.set(x, y + 0.38, z);
        tk.label.visible = tk.label.visible && u < 0.9;
        setSprite(tk.label, `${v}`, waveCss(m), 256, 128, 66);
        continue;
      }
      if (r <= N - 1) { zIdx = r; y = Y_P; }
      else {
        const pts = this.psumPath(j);
        zIdx = pts[0][1]; y = pts[0][2];
        for (let q = 0; q + 1 < pts.length; q++) {
          if (d >= pts[q][0] && d <= pts[q + 1][0]) {
            const u = sstep(0, 1, (d - pts[q][0]) / (pts[q + 1][0] - pts[q][0]));
            zIdx = lerp(pts[q][1], pts[q + 1][1], u); y = lerp(pts[q][2], pts[q + 1][2], u);
          } else if (d > pts[q + 1][0]) { zIdx = pts[q + 1][1]; y = pts[q + 1][2]; }
        }
      }
      const sc = sstep(-0.6, -0.2, r);
      // value: running total after the last PE row the token has passed
      let ii = r < 0 ? -1 : (r - Math.floor(r) > 0.3 ? Math.floor(r) : Math.floor(r) - 1);
      ii = Math.min(ii, N - 1);
      const val = ii < 0 ? 0 : S[Math.min(S.length - 1, k + ii + j + 1)].ps[ii * N + j];
      tk.mesh.position.set(this.cx(j), y, this.cz(zIdx));
      tk.mesh.scale.setScalar(Math.max(0.001, sc));
      tk.mesh.rotation.y = d * 0.8;
      tk.label.position.set(this.cx(j), y + 0.46, this.cz(zIdx));
      tk.label.scale.set(0.86 * sc, 0.43 * sc, 1);
      setSprite(tk.label, `${val}`, waveCss(m), 256, 128, 66);
    }

    // ---------------- tray
    for (let j = 0; j < N; j++) {
      let g = 0;
      for (let m = 0; m < M; m++) g = Math.max(g, bump(tf - (this.kEnter[m] + tDone + 0.1), 0.9));
      this.trayMats[j].emissiveIntensity = 0.05 + 1.4 * g;
    }

    // ---------------- C chart
    for (const b of this.bars) {
      const { m, j } = b;
      const tArr = this.kEnter[m] + tDone + 0.85;
      const grow = sstep(0, 0.9, tf - tArr);
      const v = this.run!.result[m * N + j];
      b.mesh.visible = grow > 0.001;
      b.label.visible = this.labelsOn && grow > 0.35;
      if (!b.mesh.visible) continue;
      const hgt = Math.max(0.001, Math.abs(v) * this.barK * grow);
      b.mesh.scale.y = hgt;
      b.mesh.position.set(this.chartX(j), v >= 0 ? this.y0 + hgt / 2 : this.y0 - hgt / 2, this.chartZ(m));
      waveThree(m, this.tmpC);
      b.mat.color.copy(this.tmpC).lerp(this.greenC, doneK);
      b.mat.emissive.copy(this.tmpC).lerp(this.greenC, doneK);
      b.mat.emissiveIntensity = 0.12 + 0.9 * bump(tf - tArr - 0.4, 0.9) + 0.65 * doneK + (inDone ? 0.12 * Math.sin(tf * 3 + j) : 0);
      b.label.position.set(this.chartX(j), this.y0 + Math.max(v, 0) * this.barK * grow + 0.38, this.chartZ(m));
      setSprite(b.label, `${v}`, inDone ? "#7dffb0" : waveCss(m), 256, 128, 66);
    }

    if (this.cinematic) this.applyCinematic(tfCam);
  }

  // ---------------------------------------------------------------- cameras
  poseVec(name: PoseName): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const N = this.N;
    const tc = new THREE.Vector3(1.0 + 0.5 * Math.max(0, this.M - 4), 0.5, this.cz(N / 2 + 0.7) + 0.5 * Math.max(0, this.M - 4));
    const k = 1 + 0.07 * Math.max(0, this.M - 4); // larger A -> longer chart -> step back a bit
    const sph = (az: number, el: number, r0: number, t = tc) =>
      ({ pos: new THREE.Vector3(t.x + r0 * k * Math.cos(el) * Math.sin(az), t.y + r0 * k * Math.sin(el), t.z + r0 * k * Math.cos(el) * Math.cos(az)), target: t.clone() });
    switch (name) {
      case "top": return sph(0.0, 1.38, 26, new THREE.Vector3(1.0, 0.5, this.cz(N / 2 + 0.7) - 2.2));
      case "side": return sph(-1.05, 0.42, 22);
      case "low": return sph(-0.3, 0.2, 20);
      case "close": return sph(-0.55, 0.62, 12.5, new THREE.Vector3(-0.4, 0.7, this.cz(1.4)));
      default: return sph(-0.42, 0.62, 21.5);
    }
  }
  setPose(name: PoseName) {
    const { pos, target } = this.poseVec(name);
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.camera.lookAt(target);
    this.controls.update();
  }

  /** centre of attention at clock value tf: active PEs, entering/leaving tokens, chart */
  private focusRaw(tf: number): { p: THREE.Vector3; act: number } {
    const N = this.N, M = this.M;
    const base = new THREE.Vector3(2.0, 0.5, this.cz(N / 2 + 0.2));
    let w = 0.45; let sx = base.x * w, sy = base.y * w, sz = base.z * w;
    let act = 0;
    for (let m = 0; m < M; m++) {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const b = bump(tf - (this.kEnter[m] + i + j + 0.3), 1.3);
        if (b > 0) { w += b; act += b; sx += b * this.cx(j); sy += b * 1.0; sz += b * this.cz(i); }
      }
      const dOut = tf - (this.kEnter[m] + 2 * N - 1);
      const bo = bump(dOut - 0.4, 1.8);
      if (bo > 0) { w += bo * 1.5; sx += bo * 1.5 * this.chartX((N - 1) / 2); sy += bo * 1.5 * 0.8; sz += bo * 1.5 * this.chartZ(m); }
    }
    return { p: new THREE.Vector3(sx / w, sy / w, sz / w), act };
  }

  private applyCinematic(tf: number) {
    // smoothed (centred window) focus -> deterministic, no state
    const acc = new THREE.Vector3(); let act = 0, n = 0;
    for (let k = -5; k <= 5; k++) {
      const r = this.focusRaw(tf + k * 0.28);
      acc.add(r.p); act += r.act; n++;
    }
    acc.multiplyScalar(1 / n); act /= n;
    const u = clamp((tf + 3) / (this.tEnd + 7));
    const az = lerp(-0.95, 0.3, sstep(0, 1, u)) + 0.05 * Math.sin(u * Math.PI * 4);
    const el = 0.56 + 0.1 * Math.sin(u * Math.PI * 1.6) + 0.04 * sstep(0.88, 1, u);
    const rad = (1 + 0.07 * Math.max(0, this.M - 4)) * lerp(23, 16.5, sstep(0.0, 3.0, act)) + 3 * sstep(this.tGreen - 2.5, this.tGreen + 0.5, tf);
    this.camera.position.set(acc.x + rad * Math.cos(el) * Math.sin(az), acc.y + rad * Math.sin(el), acc.z + rad * Math.cos(el) * Math.cos(az));
    this.controls.target.copy(acc);
    this.camera.lookAt(acc);
  }

  setCinematic(on: boolean) {
    this.cinematic = on;
    this.controls.enabled = !on;
  }

  render() {
    if (!this.cinematic) this.controls.update();
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeRun();
    this.composer?.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
