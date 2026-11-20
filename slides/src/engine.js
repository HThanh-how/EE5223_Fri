/* v2-cathode engine: one WebGL world, camera rig, CRT post chain, vector primitives. r158 classic globals. */
(function () {
'use strict';
var T = THREE, FX = THREE_FX;
var Q = new URLSearchParams(location.search);
var V2 = window.V2 = { T: T, FX: FX, scenes: [], cur: 0, STATIC: Q.has('static'), TIER: Q.get('q') || 'mid',
  REDUCE: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), SPACING: 70, time: 0, hooks: {} };
var COL = V2.COL = { tube: 0x030606, ph: 0x5ff2d0, am: 0xffae1f, hot: 0xff3b7a, bone: 0xe3f5ee, grat: 0x17352f, blue: 0x7aa8ff };
V2.col = function (hex, k) { return new T.Color(hex).multiplyScalar(k || 1); };
var clamp = V2.clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
V2.lerp = function (a, b, t) { return a + (b - a) * t; };
V2.ease = function (t) { t = clamp(t, 0, 1); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
V2.easeOut = function (t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
V2.rng = function (seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/* ------------------------------------------------------------ renderer */
var canvas = document.getElementById('gl');
var W = innerWidth, H = innerHeight, PR = 1, scaleAdapt = 1;
var renderer, composer, scene, camera, bloom, after, crt, floorMat, dustMat, baseLine;
var matReg = [];            // line materials: {m, w}
var ptsReg = [];            // point materials with uSize
var lwScale = 1;
V2.ok = false;

function dprCap() { return V2.TIER === 'low' ? 1 : V2.TIER === 'high' ? 2 : 1.5; }
function applySize() {
  PR = Math.max(.5, Math.min(devicePixelRatio || 1, dprCap()) * scaleAdapt);
  renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
  composer.setPixelRatio(PR); composer.setSize(W, H);
  var bw = Math.round(W * PR), bh = Math.round(H * PR);
  lwScale = bh / 1080;
  matReg.forEach(function (r) { r.m.resolution.set(bw, bh); r.m.linewidth = r.w * lwScale; });
  ptsReg.forEach(function (m) { m.uniforms.uPr.value = lwScale; });
  crt.uniforms.uRes.value.set(bw, bh);
  camera.aspect = W / H; applyShift(); camera.updateProjectionMatrix();
}
var shift = 0;
function applyShift() { camera.setViewOffset(W, H, -W * shift, 0, W, H); }

/* ------------------------------------------------------------ primitives */
function Trace(n, o) {
  o = o || {}; this.n = n; this.p = new Float32Array(n * 3);
  var g = new FX.LineGeometry(); g.setPositions(new Float32Array(n * 3));
  var m = new FX.LineMaterial({ color: 0xffffff, linewidth: o.w || 2, transparent: true, opacity: o.a == null ? 1 : o.a, depthWrite: false, blending: T.AdditiveBlending, dashed: !!o.dashed, dashSize: o.dash || .5, gapSize: o.gap || .4, worldUnits: false });
  m.color.copy(V2.col(o.color || COL.ph, o.k || 1));
  matReg.push({ m: m, w: o.w || 2 }); this.reg = matReg[matReg.length - 1];
  this.obj = new FX.Line2(g, m); this.obj.frustumCulled = false; this.g = g; this.m = m; this.dashed = !!o.dashed;
  this.setW = function (w) { this.reg.w = w; m.linewidth = w * lwScale; };
  this.setPoint = function (i, x, y, z) { var p = this.p; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; };
  m.resolution.set(Math.round(W * PR), Math.round(H * PR)); m.linewidth = (o.w || 2) * lwScale;
}
Trace.prototype.commit = function () {
  var a = this.g.attributes.instanceStart.data.array, p = this.p, n = this.n, i, k;
  for (i = 0; i < n - 1; i++) { k = i * 6; a[k] = p[i * 3]; a[k + 1] = p[i * 3 + 1]; a[k + 2] = p[i * 3 + 2]; a[k + 3] = p[i * 3 + 3]; a[k + 4] = p[i * 3 + 4]; a[k + 5] = p[i * 3 + 5]; }
  this.g.attributes.instanceStart.data.needsUpdate = true;
  if (this.dashed) this.obj.computeLineDistances();
  this.g.instanceCount = n - 1;
};
Trace.prototype.reveal = function (f) { this.g.instanceCount = Math.max(0, Math.min(this.n - 1, Math.floor(f * (this.n - 1)))); };
V2.Trace = Trace;

/* segments from flat [x0,y0,z0,x1,y1,z1,...]; colors optional per-vertex flat rgb pairs */
V2.segs = function (arr, o) {
  o = o || {};
  var g = new FX.LineSegmentsGeometry(); g.setPositions(new Float32Array(arr));
  var useVC = !!o.colors;
  var m = new FX.LineMaterial({ color: 0xffffff, linewidth: o.w || 1.5, transparent: true, opacity: o.a == null ? 1 : o.a, depthWrite: false, blending: T.AdditiveBlending, vertexColors: useVC, worldUnits: false });
  if (!useVC) m.color.copy(V2.col(o.color || COL.ph, o.k || 1));
  else g.setColors(new Float32Array(o.colors));
  matReg.push({ m: m, w: o.w || 1.5 });
  m.resolution.set(Math.round(W * PR), Math.round(H * PR)); m.linewidth = (o.w || 1.5) * lwScale;
  var l = new FX.LineSegments2(g, m); l.frustumCulled = false; l.userData.m = m; return l;
};
V2.boxEdges = function (cx, cy, cz, w, h, d) {
  var x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2, a = [];
  function e(p, q) { a.push(p[0], p[1], p[2], q[0], q[1], q[2]); }
  var c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (k) { e(c[k[0]], c[k[1]]); });
  return a;
};
V2.circle = function (cx, cy, cz, r, n, plane) { // plane 'xz' | 'xy'
  var a = [], i, t0, t1; n = n || 96;
  for (i = 0; i < n; i++) {
    t0 = i / n * Math.PI * 2; t1 = (i + 1) / n * Math.PI * 2;
    if (plane === 'xy') a.push(cx + Math.cos(t0) * r, cy + Math.sin(t0) * r, cz, cx + Math.cos(t1) * r, cy + Math.sin(t1) * r, cz);
    else a.push(cx + Math.cos(t0) * r, cy, cz + Math.sin(t0) * r, cx + Math.cos(t1) * r, cy, cz + Math.sin(t1) * r);
  }
  return a;
};

var PTS_VS = 'attribute vec3 aCol; attribute float aSeed; attribute float aSize; uniform float uSize; uniform float uPr; uniform float uTime; varying vec3 vCol; varying float vA;' +
  'void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*uPr*aSize*(1.0+0.0*aSeed); vCol=aCol; vA=1.;}';
var PTS_FS = 'varying vec3 vCol; uniform float uAlpha; void main(){ vec2 d=gl_PointCoord-.5; float r=length(d)*2.; if(r>1.) discard; float a=pow(1.-r,1.5); gl_FragColor=vec4(vCol*a, a*uAlpha); }';
V2.points = function (pos, cols, size, o) {
  o = o || {}; var n = pos.length / 3, g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new T.BufferAttribute(cols, 3));
  var sz = o.sizes || new Float32Array(n).fill(1); g.setAttribute('aSize', new T.BufferAttribute(sz, 1));
  g.setAttribute('aSeed', new T.BufferAttribute(new Float32Array(n), 1));
  var m = new T.ShaderMaterial({ vertexShader: o.vs || PTS_VS, fragmentShader: o.fs || PTS_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: Object.assign({ uSize: { value: size }, uPr: { value: lwScale }, uAlpha: { value: o.alpha == null ? 1 : o.alpha }, uTime: { value: 0 } }, o.uniforms || {}) });
  ptsReg.push(m);
  var p = new T.Points(g, m); p.frustumCulled = false; return p;
};

/* ------------------------------------------------------------ labels (HTML anchored to 3D) */
var labelsEl = document.getElementById('labels');
V2.label = function (sc, html, x, y, z, cls) {
  var el = document.createElement('div'); el.className = 'lb ' + (cls || ''); el.innerHTML = '<i class="in">' + html + '</i>'; el.style.display = 'none';
  labelsEl.appendChild(el);
  var l = { el: el, v: new T.Vector3(x + sc.i * V2.SPACING, y, z), sc: sc, lx: 0, ly: 0, on: true };
  sc.labels.push(l); return l;
};
V2.setLabel = function (l, html) { if (l._h !== html) { l.el.firstChild.innerHTML = html; l._h = html; } };
var CURVE = .05;
function barrelInv(nx, ny) { // normalised output coords from sample coords (ndc), inverse of the CRT shader mapping
  var ox = nx, oy = ny, k = CURVE, i, r2;
  for (i = 0; i < 4; i++) { r2 = ox * ox + oy * oy; var f = (1 + k) / (1 + k * r2); ox = nx * f; oy = ny * f; }
  return [ox, oy];
}
var tmpV = new T.Vector3();
function updateLabels() {
  var sc = V2.scenes[V2.cur], list = [], i, l;
  V2.scenes.forEach(function (s) { if (s !== sc || !s.labelsOn) s.labels.forEach(function (q) { if (q.shown) { q.el.style.display = 'none'; q.shown = false; } }); });
  if (!sc || !sc.labelsOn) return;
  for (i = 0; i < sc.labels.length; i++) {
    l = sc.labels[i];
    if (!l.on) { if (l.shown) { l.el.style.display = 'none'; l.shown = false; } continue; }
    tmpV.copy(l.v).project(camera);
    var vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15;
    if (!vis) { if (l.shown) { l.el.style.display = 'none'; l.shown = false; } continue; }
    var o = barrelInv(tmpV.x, tmpV.y);
    var px = (o[0] * .5 + .5) * W, py = (-o[1] * .5 + .5) * H;
    if (!l.shown) { l.el.style.display = ''; l.shown = true; }
    if (Math.abs(px - l.lx) > .3 || Math.abs(py - l.ly) > .3) { l.el.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0)'; l.lx = px; l.ly = py; }
  }
}

/* ------------------------------------------------------------ CRT final pass */
var CRT = {
  uniforms: { tDiffuse: { value: null }, uRes: { value: new T.Vector2(1920, 1080) }, uTime: { value: 0 }, uBurst: { value: 0 }, uCurve: { value: CURVE }, uScan: { value: .14 }, uRgb: { value: .0016 }, uVig: { value: .85 }, uGrain: { value: .045 }, uFlick: { value: .012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime,uBurst,uCurve,uScan,uRgb,uVig,uGrain,uFlick; varying vec2 vUv;',
    'float hash(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }',
    'void main(){',
    '  vec2 cc=vUv*2.-1.; float r2=dot(cc,cc);',
    '  vec2 s=cc*(1.+uCurve*r2)/(1.+uCurve); vec2 uv=s*.5+.5;',
    '  float band=floor(uv.y*48.); float tb=floor(uTime*24.);',
    '  float tear=(hash(vec2(band,tb))-.5)*.22*uBurst*step(.45,hash(vec2(band+3.,tb)));',
    '  uv.x+=tear; uv.y+=uBurst*uBurst*.04*sin(uTime*60.);',
    '  vec2 off=(uv-.5)*(uRgb+uBurst*.012);',
    '  vec3 col; col.r=texture2D(tDiffuse,uv+off).r; col.g=texture2D(tDiffuse,uv).g; col.b=texture2D(tDiffuse,uv-off).b;',
    '  float sl=.5-.5*cos(uv.y*360.*6.28318); col*=1.-uScan*sl;',
    '  col*=1.+.045*smoothstep(.6,1.,sin(uv.y*2.2-uTime*.45));',
    '  col*=1.-uVig*pow(r2*.5,1.35);',
    '  col*=1.+uFlick*sin(uTime*105.)+uFlick*.6*(hash(vec2(tb,1.))-.5);',
    '  float n=hash(vUv*uRes+fract(uTime)*91.);',
    '  col+=(n-.5)*uGrain*(.4+.6*(1.-dot(col,vec3(.33))));',
    '  col=mix(col,vec3(n)*vec3(.55,1.,.9)*.9,uBurst*.5); col*=1.+uBurst*.6;',
    '  float m=smoothstep(0.,.004,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));',
    '  gl_FragColor=vec4(max(col,0.)*m,1.);',
    '}'].join('\n')
};

/* ------------------------------------------------------------ camera rig */
var rig = { from: null, to: null, t: 1, dur: 1.7, pos: new T.Vector3(), look: new T.Vector3(), fov: 38, shift: .1 };
var burst = 0, mouse = { x: 0, y: 0, sx: 0, sy: 0 };
function poseOf(i) {
  var s = V2.scenes[i], c = s.cam, X = i * V2.SPACING;
  return { p: new T.Vector3(X + c.p[0], c.p[1], c.p[2]), l: new T.Vector3(X + c.l[0], c.l[1], c.l[2]), fov: c.fov || 38, shift: c.shift == null ? .1 : c.shift };
}
V2.go = function (i, instant) {
  i = clamp(i | 0, 0, V2.scenes.length - 1);
  var prev = V2.cur; var s;
  if (V2.scenes[prev]) V2.scenes[prev].leave && V2.scenes[prev].leave();
  var to = poseOf(i);
  if (instant || V2.STATIC) { rig.pos.copy(to.p); rig.look.copy(to.l); rig.fov = to.fov; rig.shift = to.shift; rig.t = 1; rig.from = rig.to = to; burst = 0; }
  else {
    rig.from = { p: rig.pos.clone(), l: rig.look.clone(), fov: rig.fov, shift: rig.shift }; rig.to = to; rig.t = 0;
    rig.dur = V2.REDUCE ? .45 : (Math.abs(i - prev) > 2 ? 2.3 : 1.6);
    if (!V2.REDUCE) burst = 1;
  }
  V2.prev = prev; V2.cur = i; s = V2.scenes[i];
  s.se = (V2.STATIC) ? 99 : 0; s.enter && s.enter();
  V2.hooks.onGo && V2.hooks.onGo(i, prev);
};
V2.flying = function () { return rig.t < 1; };

/* ------------------------------------------------------------ init */
V2.init = function () {
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  } catch (e) { return false; }
  if (!renderer.getContext()) return false;
  renderer.setClearColor(COL.tube, 1);
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  scene = new T.Scene(); scene.background = new T.Color(COL.tube);
  camera = new T.PerspectiveCamera(38, W / H, .1, 600);
  var rt = new T.WebGLRenderTarget(W, H, { type: T.HalfFloatType, samples: V2.TIER === 'low' ? 0 : 4 });
  composer = new FX.EffectComposer(renderer, rt);
  composer.addPass(new FX.RenderPass(scene, camera));
  bloom = new FX.UnrealBloomPass(new T.Vector2(W, H), .42, .38, .22); composer.addPass(bloom);
  after = new FX.AfterimagePass(.74); if (V2.TIER === 'low' || V2.REDUCE || V2.STATIC) after.enabled = false; composer.addPass(after);
  composer.addPass(new FX.OutputPass());
  crt = new FX.ShaderPass(CRT); crt.uniforms = T.UniformsUtils.clone(CRT.uniforms); crt.material.uniforms = crt.uniforms; composer.addPass(crt);
  if (V2.REDUCE) { crt.uniforms.uFlick.value = 0; }

  // floor graticule
  floorMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uCam: { value: new T.Vector3() }, uCol: { value: V2.col(COL.ph, 1) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: 'varying vec3 vW; uniform vec3 uCam; uniform vec3 uCol;' +
      'float grid(vec2 g){ vec2 f=abs(fract(g-.5)-.5)/fwidth(g); return 1.-min(min(f.x,f.y),1.); }' +
      'void main(){ float a=grid(vW.xz)*.20+grid(vW.xz/5.)*.55; float d=length(vW.xz-uCam.xz); float fade=exp(-d*d/(2.*70.*70.))*smoothstep(-90.,-4.,vW.z); gl_FragColor=vec4(uCol*a*fade*.2,1.); }' });
  var floor = new T.Mesh(new T.PlaneGeometry(500, 400), floorMat); floor.rotation.x = -Math.PI / 2; floor.frustumCulled = false; floor.renderOrder = -2; scene.add(floor); V2.floor = floor;

  // baseline: the signal that runs through the whole talk
  var n = 12 * V2.SPACING / 2 + 40, bt = new Trace(n, { w: 2.2, color: COL.ph, k: 1.6, a: .75, dashed: true, dash: 1.4, gap: 2.2 });
  for (var i = 0; i < n; i++) bt.setPoint(i, -50 + i * 2, .04, 8);
  bt.commit(); scene.add(bt.obj); baseLine = bt;

  // dust
  var dn = 900, dp = new Float32Array(dn * 3), dc = new Float32Array(dn * 3), r = V2.rng(7), c = V2.col(COL.ph, .5);
  for (i = 0; i < dn; i++) { dp[i * 3] = r() * 120 - 60; dp[i * 3 + 1] = r() * 22; dp[i * 3 + 2] = r() * 90 - 70; dc[i * 3] = c.r; dc[i * 3 + 1] = c.g; dc[i * 3 + 2] = c.b; }
  var dust = V2.points(dp, dc, 2.4, { alpha: .5, vs: 'attribute vec3 aCol; attribute float aSeed; attribute float aSize; uniform float uSize; uniform float uPr; uniform float uCamX; uniform float uTime; varying vec3 vCol;' +
    'void main(){ vec3 p=position; p.x=mod(p.x-uCamX+60.,120.)-60.+uCamX; p.y+=sin(uTime*.2+p.x)*.3; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*uPr; vCol=aCol; }', uniforms: { uCamX: { value: 0 } } });
  dustMat = dust.material; scene.add(dust);

  V2.scene = scene; V2.camera = camera; V2.renderer = renderer; V2.composer = composer;
  // build scenes
  V2.builders.forEach(function (b, i) { var s = new V2.Scene(i); b(s); V2.scenes.push(s); scene.add(s.g); });
  resizeNow();
  V2.ok = true; return true;
};

V2.Scene = function (i) { this.i = i; this.g = new T.Group(); this.g.position.x = i * V2.SPACING; this.labels = []; this.se = 0; this.labelsOn = false; this.cam = { p: [0, 5, 18], l: [0, 2, 0] }; };
V2.builders = [];

function resizeNow() { W = innerWidth; H = innerHeight; applySize(); }
V2.resize = resizeNow;

/* ------------------------------------------------------------ frame */
var frames = 0, accT = 0, accN = 0, lastAdapt = 0;
V2.stats = { fps: 0, ms: 0, scale: 1 };
function visibility() {
  var cur = V2.cur, f = V2.flying();
  V2.scenes.forEach(function (s, i) {
    var near = Math.abs(i - cur) <= 1 || (f && (i === V2.prev));
    if (V2.scenes.length - 1 === cur && cur === 11) near = true;           // establishing shot on the last slide
    var show = near && !(s.heavy && i !== cur && !(f && i === V2.prev));
    s.g.visible = show; s.labelsOn = (i === cur);
  });
}
V2.frame = function (dt, now) {
  if (!V2.ok) return;
  var t = V2.STATIC ? 6 : now;
  V2.time = t;
  dt = Math.min(dt, .05);
  // rig
  if (rig.t < 1) {
    rig.t = Math.min(1, rig.t + dt / rig.dur); var e = V2.ease(rig.t), f = rig.from, to = rig.to;
    rig.pos.lerpVectors(f.p, to.p, e); rig.look.lerpVectors(f.l, to.l, e);
    var dir = tmpV.copy(rig.look).sub(rig.pos).normalize(), pull = Math.sin(Math.PI * e) * (V2.REDUCE ? 0 : 7);
    rig.pos.addScaledVector(dir, -pull); rig.pos.y += Math.sin(Math.PI * e) * (V2.REDUCE ? 0 : 1.4);
    rig.fov = V2.lerp(f.fov, to.fov, e) + Math.sin(Math.PI * e) * (V2.REDUCE ? 0 : 6); rig.shift = V2.lerp(f.shift, to.shift, e);
  }
  burst = Math.max(0, burst - dt / .5);
  var flying = rig.t < 1;
  mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3);
  camera.position.copy(rig.pos);
  if (!V2.STATIC && !V2.REDUCE) { camera.position.x += mouse.sx * .5; camera.position.y += mouse.sy * .3; }
  camera.lookAt(rig.look);
  if (Math.abs(camera.fov - rig.fov) > .01 || Math.abs(shift - rig.shift) > .0005) { camera.fov = rig.fov; shift = rig.shift; applyShift(); camera.updateProjectionMatrix(); }
  visibility();
  var sc = V2.scenes[V2.cur];
  sc.se += dt;
  // update visible scenes
  V2.scenes.forEach(function (s) { if (s.g.visible && s.update) { if (s === sc || s === V2.scenes[V2.prev]) s.update(t, dt, s === sc ? sc.se : 99); else if (s.updateIdle) s.updateIdle(t); } });
  floorMat.uniforms.uCam.value.copy(camera.position);
  dustMat.uniforms.uCamX.value = camera.position.x; dustMat.uniforms.uTime.value = t;
  baseLine.m.dashOffset = V2.STATIC ? 0 : -(t * 3.2) % 3.6;
  after.uniforms['damp'].value = flying ? .9 : .74;
  crt.uniforms.uTime.value = t; crt.uniforms.uBurst.value = V2.REDUCE ? 0 : burst * burst;
  updateLabels();
  composer.render(dt);
  // adaptive resolution
  accT += dt; accN++;
  if (accN >= 45) {
    var avg = accT / accN; V2.stats.ms = avg * 1000; V2.stats.fps = 1 / avg; accT = 0; accN = 0;
    if (!V2.STATIC && now - lastAdapt > 1.5 && !flying) {
      if (avg > .0215 && scaleAdapt > .6) { scaleAdapt = Math.max(.6, scaleAdapt - .1); applySize(); lastAdapt = now; }
      else if (avg < .0125 && scaleAdapt < 1) { scaleAdapt = Math.min(1, scaleAdapt + .1); applySize(); lastAdapt = now; }
    }
    V2.stats.scale = scaleAdapt;
  }
  V2.hooks.afterRender && V2.hooks.afterRender(flying);
};
V2.setMouse = function (x, y) { mouse.x = x; mouse.y = y; };
V2.settled = function () { return rig.t >= 1; };
V2.info = function () { return renderer.info.render; };
window.addEventListener('resize', function () { if (V2.ok) resizeNow(); });

/* render slide i fully settled into a 2D canvas (thumbnails, print) */
V2.still = function (i, w, h) {
  var keepCur = V2.cur, keepPrev = V2.prev, keepRig = { pos: rig.pos.clone(), look: rig.look.clone(), fov: rig.fov, shift: rig.shift, t: rig.t, from: rig.from, to: rig.to };
  var s = V2.scenes[i], oldSe = s.se, oldCur = V2.cur;
  V2.cur = i; V2.prev = i; var p = poseOf(i);
  camera.position.copy(p.p); camera.lookAt(p.l); camera.fov = p.fov; shift = p.shift; applyShift(); camera.updateProjectionMatrix();
  s.se = 99; V2.scenes.forEach(function (q, k) { q.g.visible = (Math.abs(k - i) <= 1 && !(q.heavy && k !== i)) || (i === 11); });
  V2.scenes.forEach(function (q) { if (q.g.visible && q.update) q.update(6, .016, 99); });
  floorMat.uniforms.uCam.value.copy(camera.position); dustMat.uniforms.uCamX.value = camera.position.x;
  crt.uniforms.uBurst.value = 0; crt.uniforms.uTime.value = 6;
  var a0 = after.enabled; after.enabled = false;
  composer.render(.016);
  var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(canvas, 0, 0, w, h);
  after.enabled = a0;
  var out = []; s.labels.forEach(function (l) { if (!l.on) return; tmpV.copy(l.v).project(camera); if (tmpV.z >= 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) return; var o = barrelInv(tmpV.x, tmpV.y); out.push({ html: l.el.firstChild.innerHTML, cls: l.el.className.replace('lb ', ''), x: (o[0] * .5 + .5) * 1920, y: (-o[1] * .5 + .5) * 1080 }); }); V2.stillLabels = out;
  s.se = oldSe; V2.cur = keepCur; V2.prev = keepPrev;
  rig.pos.copy(keepRig.pos); rig.look.copy(keepRig.look); rig.fov = keepRig.fov; rig.shift = keepRig.shift;
  camera.position.copy(rig.pos); camera.lookAt(rig.look); camera.fov = rig.fov; shift = rig.shift; applyShift(); camera.updateProjectionMatrix();
  return c;
};
})();
