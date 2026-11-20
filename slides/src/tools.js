/* v2-cathode presenter layer: control tray, laser, ink, overview, notes, timer, presenter window, help, menu */
(function () {
'use strict';
window.V2TOOLS = function (D) {
var V2 = window.V2, S = window.SLIDES, N = S.length, Q = new URLSearchParams(location.search);
var body = document.body, $ = function (id) { return document.getElementById(id); };
function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
var IC = {
  prev: '<path d="M15 5 8 12l7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
  grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
  notes: '<path d="M4 5h16M4 10h16M4 15h10M4 20h6"/>', timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9 3h6"/>',
  pres: '<rect x="3" y="4" width="13" height="10"/><rect x="8" y="10" width="13" height="10"/>', laser: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22"/>',
  pen: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M13 7l4 4"/>', hl: '<path d="M6 17l9-9 3 3-9 9H6z"/><path d="M4 21h9"/>', eraser: '<path d="M5 15l8-9 6 6-5 6H9z"/><path d="M7 20h13"/>',
  undo: '<path d="M9 6 4 11l5 5"/><path d="M4 11h9a6 6 0 0 1 0 9"/>', redo: '<path d="m15 6 5 5-5 5"/><path d="M20 11h-9a6 6 0 0 0 0 9"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>', moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.5a2.7 2.7 0 1 1 3.9 2.4c-.8.5-1.2 1-1.2 2M12 17.2v.3"/>',
  fs: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'
};
function ic(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + IC[n] + '</svg>'; }
function ib(id, icon, label, key, pressed) { return '<button type="button" class="ib" id="' + id + '" aria-label="' + label + (key ? ' (' + key + ')' : '') + '" title="' + label + (key ? ' (' + key + ')' : '') + '"' + (pressed ? ' aria-pressed="false"' : '') + '>' + ic(icon) + '</button>'; }

/* ---------------------------------------------------------------- DOM */
var hud = el('div', { id: 'hud' });
hud.innerHTML = '<div id="tray" role="toolbar" aria-label="Presentation controls">' + '<div id="cnt" aria-live="polite">01/12</div>' +
  ib('bPrev', 'prev', 'Previous slide', 'Left') + ib('bNext', 'next', 'Next slide', 'Right') + ib('bOv', 'grid', 'Overview', 'O', true) + ib('bNotes', 'notes', 'Speaker notes', 'N', true) +
  ib('bTimer', 'timer', 'Timer', 'T', true) + ib('bPres', 'pres', 'Presenter view', 'P') + ib('bLaser', 'laser', 'Laser pointer', 'L', true) + ib('bPen', 'pen', 'Ink', 'D', true) +
  ib('bBlack', 'moon', 'Blackout', 'B', true) + ib('bHelp', 'help', 'Keyboard shortcuts', '?') + ib('bFs', 'fs', 'Fullscreen', 'F', true) + '</div>';
body.appendChild(hud);
var trace = el('div', { id: 'trace', role: 'tablist', 'aria-label': 'Slides' });
S.forEach(function (s, i) { var b = el('button', { type: 'button', 'aria-label': 'Go to slide ' + (i + 1) + ': ' + s.short, title: (i + 1) + '. ' + s.short, tabindex: '-1' }); b.addEventListener('click', function () { D.go(i); b.blur(); }); trace.appendChild(b); });
body.appendChild(trace);
var toast = el('div', { id: 'toast', role: 'status' }); body.appendChild(toast);
var clock = el('div', { id: 'clock', role: 'timer', 'aria-label': 'Talk timer' }, '<span id="clE">00:00</span><span id="clL"></span><span class="pace" id="clP"></span>'); body.appendChild(clock);
var notes = el('div', { id: 'notes', role: 'region', 'aria-label': 'Speaker notes' }, '<h3 id="ntH"></h3><p id="ntP"></p>'); body.appendChild(notes);
var blk = el('div', { id: 'blackout', 'aria-hidden': 'true' }); body.appendChild(blk);
var ink = el('canvas', { id: 'ink', 'aria-hidden': 'true' }); body.appendChild(ink);
var trail = el('canvas', { id: 'trail', 'aria-hidden': 'true' }); body.appendChild(trail);
var laser = el('div', { id: 'laser', 'aria-hidden': 'true' }, '<i></i>'); body.appendChild(laser);
var COLORS = [['#ffffff', 'white'], ['#5ff2d0', 'phosphor green'], ['#ffae1f', 'amber'], ['#ff3b7a', 'hot pink'], ['#7aa8ff', 'blue'], ['#c58bff', 'violet']];
var pen = el('div', { id: 'pen', role: 'toolbar', 'aria-label': 'Ink tools' });
pen.innerHTML = ib('tPen', 'pen', 'Pen', '', true) + ib('tHl', 'hl', 'Highlighter', '', true) + ib('tEr', 'eraser', 'Eraser', '', true) + '<div class="sep"></div>' +
  COLORS.map(function (c, i) { return '<button type="button" class="sw2" data-c="' + i + '" aria-label="Ink colour ' + c[1] + '" aria-pressed="false"><i style="background:' + c[0] + '"></i></button>'; }).join('') + '<div class="sep"></div>' +
  '<input type="range" id="tSize" min="2" max="22" value="5" aria-label="Stroke size" title="Stroke size ([ and ])">' + '<div class="sep"></div>' +
  ib('tUndo', 'undo', 'Undo', 'Ctrl+Z') + ib('tRedo', 'redo', 'Redo', 'Ctrl+Y') + ib('tClear', 'trash', 'Clear ink on this slide', 'Delete') + ib('tClose', 'close', 'Close ink', 'Esc');
body.appendChild(pen);
var ov = el('div', { id: 'overview', role: 'dialog', 'aria-label': 'Slide overview' }, '<h3>Overview: click a slide, arrows move, Esc closes</h3><div id="ovgrid"></div>'); body.appendChild(ov);
var help = el('div', { id: 'help', role: 'dialog', 'aria-label': 'Keyboard shortcuts' }); body.appendChild(help);
var menu = el('div', { id: 'menu', role: 'menu' }); body.appendChild(menu);

/* ---------------------------------------------------------------- helpers */
var toastT = 0; function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toast.classList.remove('on'); }, 1300); }
function pressed(id, on) { var b = $(id); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
function fmt(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r; }
D.say = say;

/* ---------------------------------------------------------------- counter + trace */
var cntEl = $('cnt'), tb = trace.children;
D.on(function (i) {
  cntEl.textContent = (i < 9 ? '0' : '') + (i + 1) + '/' + N;
  for (var k = 0; k < tb.length; k++) { tb[k].classList.toggle('on', k === i); tb[k].classList.toggle('done', k < i); }
  $('ntH').textContent = 'Slide ' + (i + 1) + ': ' + S[i].short + '  (' + S[i].notes.split(/\s+/).length + ' words)'; $('ntP').textContent = S[i].notes;
  inkSwap(i); sync();
});
cntEl.textContent = (D.cur < 9 ? '0' : '') + (D.cur + 1) + '/' + N; for (var kk = 0; kk < tb.length; kk++) { tb[kk].classList.toggle('on', kk === D.cur); tb[kk].classList.toggle('done', kk < D.cur); }
$('ntH').textContent = 'Slide ' + (D.cur + 1) + ': ' + S[D.cur].short + '  (' + S[D.cur].notes.split(/\s+/).length + ' words)'; $('ntP').textContent = S[D.cur].notes;

/* ---------------------------------------------------------------- thumbnails */
D.thumbs = []; var thumbDone = [];
V2.hooks.afterRender = function (flying) {
  var i = V2.cur; if (!thumbDone[i] && !flying && V2.scenes[i].se > 2.8 && !D.overview && !D.blackout) { thumbDone[i] = true; D.thumbs[i] = grab(); }
};
function grab() { var c = document.createElement('canvas'); c.width = 480; c.height = 270; var g = c.getContext('2d'); g.drawImage($('gl'), 0, 0, 480, 270); return c; }
function ensureThumbs() { if (!V2.ok) return; for (var i = 0; i < N; i++) if (!D.thumbs[i]) { var c = V2.still(i, 480, 270); D.thumbs[i] = c; } }

/* ---------------------------------------------------------------- notes, blackout, fullscreen */
D.setNotes = function (on) { notes.classList.toggle('on', on); pressed('bNotes', on); };
D.setBlackout = function (on, white) { D.blackout = on; blk.classList.toggle('on', on); blk.classList.toggle('white', !!white); pressed('bBlack', on); if (!on) blk.classList.remove('white'); };
function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { say('Fullscreen blocked'); }); }
document.addEventListener('fullscreenchange', function () { body.classList.toggle('fs', !!document.fullscreenElement); pressed('bFs', !!document.fullscreenElement); });

/* ---------------------------------------------------------------- timer */
var tStart = 0, tShown = false, tAcc = 0, tRun = false, TARGET = 900, PLAN = S.map(function (s) { return s.plan; });
var cum = []; PLAN.reduce(function (a, p, i) { cum[i] = a + p; return a + p; }, 0);
function elapsed(now) { return tAcc + (tRun ? now - tStart : 0); }
D.setTimer = function (on) { tShown = on; clock.classList.toggle('on', on); pressed('bTimer', on); if (on && !tRun) { tRun = true; tStart = performance.now() / 1000; } };
D.resetTimer = function () { tAcc = 0; tStart = performance.now() / 1000; tRun = true; say('Timer reset'); };
D.timerInfo = function () {
  var e = elapsed(performance.now() / 1000), i = D.cur, startPlan = i ? cum[i - 1] : 0, endPlan = cum[i], pace, cls, d;
  if (e < startPlan - 10) { pace = 'ahead ' + fmt(startPlan - e); cls = 'ahead'; } else if (e > endPlan + 10) { pace = 'behind ' + fmt(e - endPlan); cls = 'behind'; } else { pace = 'on pace'; cls = 'ahead'; }
  if (e > TARGET) { pace = 'over ' + fmt(e - TARGET); cls = 'over'; }
  return { e: fmt(e), left: (e > TARGET ? '+' : '-') + fmt(Math.abs(TARGET - e)), pace: pace, cls: cls };
};
var lastClk = 0;
function updClock(now) { if (now - lastClk < .5) return; lastClk = now; var t = D.timerInfo(); if (tShown) { $('clE').textContent = t.e; $('clL').textContent = t.left; var p = $('clP'); p.textContent = t.pace; p.className = 'pace ' + t.cls; } pwTick(t); }

/* ---------------------------------------------------------------- overview */
function buildOv() {
  var g = $('ovgrid'); g.innerHTML = '';
  S.forEach(function (s, i) {
    var b = el('button', { type: 'button', class: 'ovc' + (i === D.cur ? ' on' : ''), 'aria-label': 'Slide ' + (i + 1) + ': ' + s.short }); var c = el('canvas'); c.width = 480; c.height = 270;
    if (D.thumbs[i]) c.getContext('2d').drawImage(D.thumbs[i], 0, 0);
    b.appendChild(c); b.insertAdjacentHTML('beforeend', '<span><b>' + (i < 9 ? '0' : '') + (i + 1) + '</b>' + s.short + '</span>');
    b.addEventListener('click', function () { D.setOverview(false); D.go(i); }); g.appendChild(b);
  });
}
D.setOverview = function (on) {
  if (on === D.overview) return;
  if (on) { ensureThumbs(); buildOv(); }
  D.overview = on; ov.classList.toggle('on', on); pressed('bOv', on);
  if (on) { var b = $('ovgrid').children[D.cur]; b && b.focus(); }
};
ov.addEventListener('keydown', function (e) {
  var items = [].slice.call($('ovgrid').children), i = items.indexOf(document.activeElement), d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
  if (d != null) { var j = Math.max(0, Math.min(N - 1, (i < 0 ? D.cur : i) + d)); items[j].focus(); e.preventDefault(); e.stopPropagation(); }
});

/* ---------------------------------------------------------------- help */
help.innerHTML = '<h3>Keyboard shortcuts</h3><div class="g">' + [
  ['Right, Down, PageDown, Space, Enter', 'next slide'], ['Left, Up, PageUp', 'previous slide'], ['Home, End', 'first, last slide'], ['number then Enter', 'go to slide'],
  ['S', '??i bi?u ?? k?t qu?'], ['F', 'fullscreen'], ['N', 'speaker notes'], ['T', 'timer, R resets'], ['P', 'presenter window'],
  ['O', 'overview'], ['L', 'laser, [ ] or wheel for size'], ['D', 'ink: pen, highlighter, eraser'], ['Ctrl+Z, Ctrl+Y, Delete', 'undo, redo, clear ink'],
  ['B or period', 'blackout'], ['W', 'whiteout'], ['?', 'this help'], ['Esc', 'close overlays'], ['Right click', 'next slide'], ['Shift + right click', 'menu'], ['Swipe', 'previous, next on touch']
].map(function (r) { return '<div class="r"><span>' + r[0].replace(/(^|, | or )([A-Za-z0-9?.]+)(?=,| or |$)/g, '$1<kbd>$2</kbd>') + '</span><span>' + r[1] + '</span></div>'; }).join('') + '</div>';
D.setHelp = function (on) { help.classList.toggle('on', on); };

/* ---------------------------------------------------------------- context menu */
var MENU = [['First slide', 'Home', function () { D.go(0); }], ['Last slide', 'End', function () { D.go(N - 1); }], ['Overview', 'O', function () { D.setOverview(true); }], ['Speaker notes', 'N', function () { D.setNotes(!notes.classList.contains('on')); }],
  ['Timer', 'T', function () { D.setTimer(!tShown); }], ['Presenter window', 'P', function () { openPresenter(); }], ['Laser pointer', 'L', function () { setLaser(!laserOn); }], ['Ink', 'D', function () { setPen(!penOn); }],
  ['Clear ink on this slide', '', function () { inkClear(); }], ['Blackout', 'B', function () { D.setBlackout(!D.blackout); }], ['Fullscreen', 'F', toggleFs], ['Keyboard shortcuts', '?', function () { D.setHelp(true); }]];
menu.innerHTML = ''; MENU.forEach(function (m, i) { var b = el('button', { type: 'button', role: 'menuitem' }, m[0] + '<span>' + m[1] + '</span>'); b.addEventListener('click', function () { hideMenu(); m[2](); }); menu.appendChild(b); });
function hideMenu() { menu.classList.remove('on'); }
document.addEventListener('contextmenu', function (e) { if (!e.shiftKey) return; if (e.target.closest('#tray,#pen,#overview,#help')) return; e.preventDefault(); menu.classList.add('on'); var w = menu.offsetWidth, h = menu.offsetHeight; menu.style.left = Math.min(e.clientX, innerWidth - w - 6) + 'px'; menu.style.top = Math.min(e.clientY, innerHeight - h - 6) + 'px'; menu.firstChild.focus(); });
document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#menu')) hideMenu(); if (!e.target.closest('#help') && help.classList.contains('on') && !e.target.closest('#bHelp')) D.setHelp(false); }, true);

/* ---------------------------------------------------------------- laser */
var laserOn = false, lsz = 22, mx = -99, my = -99, lastMove = 0, tpts = [], tctx = trail.getContext('2d'), trailDirty = false;
function sizeTrail() { trail.width = innerWidth; trail.height = innerHeight; }
sizeTrail();
function setLaser(on) { laserOn = on; body.classList.toggle('laser', on); pressed('bLaser', on); laser.style.display = on ? '' : 'none'; if (!on) { tpts = []; tctx.clearRect(0, 0, trail.width, trail.height); } if (on) { if (penOn) setPen(false); say('Laser on, [ ] or wheel for size'); } laser.firstChild.style.width = laser.firstChild.style.height = lsz + 'px'; }
laser.style.display = 'none';
addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; lastMove = performance.now(); if (laserOn) { laser.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)'; tpts.push({ x: mx, y: my, t: lastMove }); if (tpts.length > 60) tpts.shift(); trailDirty = true; } V2.setMouse && V2.setMouse(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1)); wake(); }, { passive: true });
addEventListener('wheel', function (e) { if (laserOn) { lsz = Math.max(10, Math.min(70, lsz + (e.deltaY < 0 ? 4 : -4))); laser.firstChild.style.width = laser.firstChild.style.height = lsz + 'px'; e.preventDefault(); } }, { passive: false });
function drawTrail(now) {
  if (!laserOn || !trailDirty && !tpts.length) return; var ms = 480, c = tctx; c.clearRect(0, 0, trail.width, trail.height);
  while (tpts.length && now - tpts[0].t > ms) tpts.shift(); if (tpts.length < 2) { trailDirty = false; return; }
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (var i = 1; i < tpts.length; i++) { var a = tpts[i - 1], b = tpts[i], f = 1 - (now - b.t) / ms; if (f <= 0) continue; c.strokeStyle = 'rgba(255,59,122,' + (f * .75).toFixed(3) + ')'; c.lineWidth = lsz * .5 * f + 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
}

/* ---------------------------------------------------------------- ink */
var penOn = false, tool = 'pen', colorI = 2, size = 5, ictx = ink.getContext('2d'), IDPR = Math.min(devicePixelRatio || 1, 1.5);
var inkStore = [], undo = [], redo = [], dirty = false, cur = null, snap = null;
function sizeInk(keep) {
  var w = Math.round(innerWidth * IDPR), h = Math.round(innerHeight * IDPR), tmp = null;
  if (keep && ink.width) { tmp = document.createElement('canvas'); tmp.width = ink.width; tmp.height = ink.height; tmp.getContext('2d').drawImage(ink, 0, 0); }
  ink.width = w; ink.height = h; if (tmp) ictx.drawImage(tmp, 0, 0, w, h);
}
sizeInk(false);
addEventListener('resize', function () { sizeInk(true); sizeTrail(); });
function copyInk() { var c = document.createElement('canvas'); c.width = ink.width; c.height = ink.height; c.getContext('2d').drawImage(ink, 0, 0); return c; }
function inkSwap(i) { // called on slide change: store old, restore new
  if (inkSwap.last != null && dirty) inkStore[inkSwap.last] = copyInk(); else if (inkSwap.last != null && !inkStore[inkSwap.last]) inkStore[inkSwap.last] = null;
  ictx.clearRect(0, 0, ink.width, ink.height); if (inkStore[i]) ictx.drawImage(inkStore[i], 0, 0, ink.width, ink.height);
  dirty = !!inkStore[i]; undo = []; redo = []; inkSwap.last = i; updUndo();
}
function inkClear() { if (dirty) { pushUndo(); ictx.clearRect(0, 0, ink.width, ink.height); dirty = false; inkStore[D.cur] = null; say('Ink cleared'); } }
function pushUndo() { undo.push(copyInk()); if (undo.length > 8) undo.shift(); redo = []; updUndo(); }
function updUndo() { $('tUndo').disabled = !undo.length; $('tRedo').disabled = !redo.length; $('tUndo').style.opacity = undo.length ? 1 : .4; $('tRedo').style.opacity = redo.length ? 1 : .4; }
function doUndo() { if (!undo.length) return; redo.push(copyInk()); var c = undo.pop(); ictx.clearRect(0, 0, ink.width, ink.height); ictx.drawImage(c, 0, 0); updUndo(); }
function doRedo() { if (!redo.length) return; undo.push(copyInk()); var c = redo.pop(); ictx.clearRect(0, 0, ink.width, ink.height); ictx.drawImage(c, 0, 0); updUndo(); }
function setPen(on) { penOn = on; body.classList.toggle('pen', on); pressed('bPen', on); if (on && laserOn) setLaser(false); if (on) say('Ink on, Esc closes'); syncPen(); }
function syncPen() { [['tPen', 'pen'], ['tHl', 'hl'], ['tEr', 'er']].forEach(function (p) { pressed(p[0], tool === ({ pen: 'pen', hl: 'hl', er: 'er' })[p[1]]); }); [].forEach.call(pen.querySelectorAll('.sw2'), function (b, i) { b.setAttribute('aria-pressed', i === colorI ? 'true' : 'false'); }); }
function renderStroke() {
  ictx.clearRect(0, 0, ink.width, ink.height); ictx.drawImage(snap, 0, 0);
  var p = cur.pts, c = ictx; c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  if (cur.tool === 'er') { c.globalCompositeOperation = 'destination-out'; c.lineWidth = cur.w * 4 * IDPR; c.strokeStyle = '#000'; }
  else if (cur.tool === 'hl') { c.globalAlpha = .38; c.lineWidth = cur.w * 4.5 * IDPR; c.strokeStyle = COLORS[cur.col][0]; c.lineCap = 'butt'; }
  else { c.lineWidth = cur.w * IDPR; c.strokeStyle = COLORS[cur.col][0]; c.shadowColor = COLORS[cur.col][0]; c.shadowBlur = 6 * IDPR; }
  c.beginPath(); c.moveTo(p[0].x, p[0].y);
  if (p.length < 3) c.lineTo(p[p.length - 1].x + .01, p[p.length - 1].y); else { for (var i = 1; i < p.length - 1; i++) { var mx2 = (p[i].x + p[i + 1].x) / 2, my2 = (p[i].y + p[i + 1].y) / 2; c.quadraticCurveTo(p[i].x, p[i].y, mx2, my2); } c.lineTo(p[p.length - 1].x, p[p.length - 1].y); }
  c.stroke(); c.restore();
}
ink.addEventListener('pointerdown', function (e) { if (!penOn || e.button > 0) return; ink.setPointerCapture(e.pointerId); snap = copyInk(); undo.push(snap); if (undo.length > 8) undo.shift(); redo = []; updUndo(); cur = { tool: tool, col: colorI, w: size, pts: [{ x: e.offsetX * IDPR, y: e.offsetY * IDPR }] }; renderStroke(); dirty = true; e.preventDefault(); });
ink.addEventListener('pointermove', function (e) { if (!cur) return; var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; evs.forEach(function (q) { cur.pts.push({ x: (q.clientX) * IDPR, y: (q.clientY) * IDPR }); }); renderStroke(); });
function endStroke() { if (cur) { cur = null; snap = null; } }
ink.addEventListener('pointerup', endStroke); ink.addEventListener('pointercancel', endStroke);
pen.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.id === 'tPen') tool = 'pen'; else if (b.id === 'tHl') tool = 'hl'; else if (b.id === 'tEr') tool = 'er'; else if (b.dataset.c != null) { colorI = +b.dataset.c; if (tool === 'er') tool = 'pen'; }
  else if (b.id === 'tUndo') doUndo(); else if (b.id === 'tRedo') doRedo(); else if (b.id === 'tClear') inkClear(); else if (b.id === 'tClose') setPen(false);
  syncPen(); if (e.detail) b.blur();
});
$('tSize').addEventListener('input', function (e) { size = +e.target.value; }); $('tSize').addEventListener('change', function (e) { e.target.blur(); });

/* ---------------------------------------------------------------- presenter window */
var pw = null;
function pwMain() {
  var D = window.opener && window.opener.V2 && window.opener.V2.deck, S = window.opener.SLIDES;
  var $ = function (i) { return document.getElementById(i); };
  window.__sync = function (st) { $('t').textContent = st.title; $('n').textContent = st.notes; $('c').textContent = st.c; $('nt').textContent = st.next; $('wc').textContent = st.wc + ' words'; var a = $('th'); a.getContext('2d').clearRect(0, 0, a.width, a.height); if (st.nthumb) a.getContext('2d').drawImage(st.nthumb, 0, 0, a.width, a.height); var b = $('cu'); b.getContext('2d').clearRect(0, 0, b.width, b.height); if (st.thumb) b.getContext('2d').drawImage(st.thumb, 0, 0, b.width, b.height); };
  window.__tick = function (t) { $('e').textContent = t.e; $('l').textContent = t.left; var p = $('p'); p.textContent = t.pace; p.className = t.cls; };
  $('pv').onclick = function () { D.prev(); }; $('nx').onclick = function () { D.next(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') D.next(); else if (e.key === 'ArrowLeft' || e.key === 'PageUp') D.prev(); else if (e.key === 'b' || e.key === '.') D.setBlackout(!D.blackout); });
  setInterval(function () { if (!window.opener || window.opener.closed) window.close(); }, 1500);
  window.opener.V2.deck.pwReady && window.opener.V2.deck.pwReady();
}
var PW_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Presenter view</title><style>' +
  ':root{--ph:#5ff2d0;--am:#ffae1f;--hot:#ff3b7a;--bone:#e3f5ee;--dim:#93b8ad}*{box-sizing:border-box}html,body{margin:0;height:100%;background:#030606;color:var(--bone);font-family:"IBM Plex Mono",Consolas,monospace}' +
  'body{display:grid;grid-template-columns:1.5fr 1fr;grid-template-rows:auto 1fr;gap:16px 24px;padding:20px 24px;height:100vh}header{grid-column:1/3;display:flex;align-items:baseline;gap:28px;border-bottom:1px solid #1d4a41;padding-bottom:12px}' +
  '#c{font:400 40px/1 monospace;color:var(--ph)}#t{font-size:22px;font-weight:600;flex:1}#e{font:400 64px/1 monospace;color:var(--bone)}#l{font:400 36px/1 monospace;color:var(--dim)}#p{font-weight:600;font-size:16px;border:1.5px solid currentColor;padding:2px 8px}.ahead{color:var(--ph)}.behind{color:var(--am)}.over{color:var(--hot)}' +
  'main{overflow:auto}#n{font-size:clamp(20px,2.4vw,34px);line-height:1.5;margin:0}#wc{color:var(--dim);font-size:14px}aside{display:flex;flex-direction:column;gap:12px}aside canvas{width:100%;aspect-ratio:16/9;border:1px solid #1d4a41;background:#050c0b}' +
  'aside h4{margin:6px 0 0;font-size:14px;color:var(--dim);font-weight:400}button{font:600 18px monospace;background:transparent;color:var(--ph);border:1.5px solid var(--ph);padding:12px 18px;min-height:48px;cursor:pointer}button:hover{background:#0c2a25}button:focus-visible{outline:3px solid var(--am)}.row{display:flex;gap:12px}' +
  '</style></head><body><header><span id="c">01/12</span><span id="t"></span><span id="p"></span><span id="l"></span><span id="e">00:00</span></header>' +
  '<main><p id="n"></p><p id="wc"></p></main><aside><h4>Now on screen</h4><canvas id="cu" width="480" height="270"></canvas><h4>Next: <span id="nt"></span></h4><canvas id="th" width="480" height="270"></canvas><div class="row"><button id="pv" type="button">Previous</button><button id="nx" type="button">Next</button></div></aside>' +
  '<script>(' + pwMain.toString() + ')()<\/script></body></html>';
function openPresenter() {
  var w = null; try { w = window.open('', 'v2cathode-presenter', 'popup=yes,width=1180,height=720'); } catch (e) { }
  if (!w) { D.setNotes(true); say('Popup blocked: notes panel instead'); return; }
  try { w.document.open(); w.document.write(PW_HTML); w.document.close(); } catch (e) { D.setNotes(true); say('Presenter window unavailable: notes panel'); return; }
  pw = w; ensureThumbs(); D.pwReady = function () { pwSync(); };
}
function pwSync() { if (!pw || pw.closed || !pw.__sync) return; var i = D.cur, n = S[i + 1]; try { pw.__sync({ c: (i < 9 ? '0' : '') + (i + 1) + '/' + N, title: S[i].short + ': ' + S[i].title, notes: S[i].notes, wc: S[i].notes.split(/\s+/).length, next: n ? n.short : 'end of talk', nthumb: D.thumbs[i + 1] || null, thumb: D.thumbs[i] || null }); } catch (e) { } }
function pwTick(t) { if (!pw || pw.closed || !pw.__tick) return; try { pw.__tick(t); } catch (e) { } }
D.on(function () { pwSync(); });
D.openPresenter = openPresenter;

/* ---------------------------------------------------------------- tray clicks */
function bind(id, f) { $(id).addEventListener('click', function (e) { f(e); if (e.detail) e.currentTarget.blur(); }); }
bind('bPrev', function () { D.prev(); }); bind('bNext', function () { D.next(); }); bind('bOv', function () { D.setOverview(!D.overview); });
bind('bNotes', function () { D.setNotes(!notes.classList.contains('on')); }); bind('bTimer', function () { D.setTimer(!tShown); }); bind('bPres', openPresenter);
bind('bLaser', function () { setLaser(!laserOn); }); bind('bPen', function () { setPen(!penOn); }); bind('bBlack', function () { D.setBlackout(!D.blackout); }); bind('bHelp', function () { D.setHelp(!help.classList.contains('on')); }); bind('bFs', toggleFs);

/* ---------------------------------------------------------------- idle */
var idleT = 0;
function wake() { body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(function () { if (!document.querySelector('#tray:hover')) body.classList.add('idle'); }, 2200); }
['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { addEventListener(ev, wake, { passive: true }); }); wake();

/* ---------------------------------------------------------------- keyboard */
var numBuf = '', numT = 0;
function sync() { }
addEventListener('keydown', function (e) {
  var k = e.key, tg = e.target; if (e.ctrlKey || e.metaKey) { if (penOn && (k === 'z' || k === 'Z')) { e.shiftKey ? doRedo() : doUndo(); e.preventDefault(); } else if (penOn && (k === 'y' || k === 'Y')) { doRedo(); e.preventDefault(); } return; }
  if (e.altKey) return;
  if (tg && tg.tagName === 'INPUT' && tg.type !== 'range') return;
  if (tg && tg.tagName === 'BUTTON' && (k === 'Enter' || k === ' ')) return;
  var lk = k.length === 1 ? k.toLowerCase() : k;
  if (k === 'Escape') { if (help.classList.contains('on')) D.setHelp(false); else if (menu.classList.contains('on')) hideMenu(); else if (D.overview) D.setOverview(false); else if (penOn) setPen(false); else if (laserOn) setLaser(false); else if (notes.classList.contains('on')) D.setNotes(false); else if (D.blackout) D.setBlackout(false); numBuf = ''; return; }
  if (D.overview) { if (k === 'o' || k === 'O') D.setOverview(false); return; }
  if (/^[0-9]$/.test(k)) { numBuf += k; say('Go to slide ' + numBuf + ' (Enter)'); clearTimeout(numT); numT = setTimeout(function () { numBuf = ''; }, 2500); e.preventDefault(); return; }
  if (k === 'Enter' && numBuf) { var n = parseInt(numBuf, 10); numBuf = ''; if (n >= 1 && n <= N) D.go(n - 1); else say('No slide ' + n); e.preventDefault(); return; }
  var nxt = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'], prv = ['ArrowLeft', 'ArrowUp', 'PageUp'];
  if (nxt.indexOf(k) >= 0) { D.next(); e.preventDefault(); return; }
  if (prv.indexOf(k) >= 0) { D.prev(); e.preventDefault(); return; }
  if (k === 'Home') { D.go(0); e.preventDefault(); return; } if (k === 'End') { D.go(N - 1); e.preventDefault(); return; }
  if (k === 'Delete' && penOn) { inkClear(); return; }
  if (k === '?' || (k === '/' && e.shiftKey)) { D.setHelp(!help.classList.contains('on')); return; }
  if (k === '.' || lk === 'b') { D.setBlackout(!D.blackout); return; }
  if (lk === 'w') { D.setBlackout(!D.blackout, true); return; }
  if (lk === 'f') { toggleFs(); return; } if (lk === 'n') { D.setNotes(!notes.classList.contains('on')); return; }
  if (lk === 't') { D.setTimer(!tShown); return; } if (lk === 'r' && tShown) { D.resetTimer(); return; }
  if (lk === 'p') { openPresenter(); return; } if (lk === 'o') { D.setOverview(true); return; }
  if (lk === 'l') { setLaser(!laserOn); return; } if (lk === 'd') { setPen(!penOn); return; }
  if (k === '[' || k === ']') { var dd = k === ']' ? 1 : -1; if (laserOn) { lsz = Math.max(10, Math.min(70, lsz + dd * 4)); laser.firstChild.style.width = laser.firstChild.style.height = lsz + 'px'; } else if (penOn) { size = Math.max(2, Math.min(22, size + dd * 2)); $('tSize').value = size; } return; }
  if (lk === 's' || lk === 'm') { D.key(lk); return; }
});

/* ---------------------------------------------------------------- touch swipe */
var tx = 0, ty = 0, tt = 0;
addEventListener('touchstart', function (e) { if (penOn || e.touches.length !== 1 || e.target.closest('#tray,#pen,#overview,#notes,#help,#menu')) { tt = 0; return; } tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = performance.now(); }, { passive: true });
addEventListener('touchend', function (e) { if (!tt) return; var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty; if (performance.now() - tt < 700 && Math.abs(dx) > 60 && Math.abs(dy) < Math.abs(dx) * .7) { dx < 0 ? D.next() : D.prev(); } tt = 0; }, { passive: true });
document.addEventListener('visibilitychange', function () { if (document.hidden) { } });

/* ---------------------------------------------------------------- tick + print */
D.tick = function (dt, now) { drawTrail(performance.now()); updClock(now); };
var printed = [];
addEventListener('beforeprint', function () {
  if (!V2.ok) return; var slides = document.querySelectorAll('.slide');
  for (var i = 0; i < N; i++) {
    var c = V2.still(i, 1920, 1080), im = new Image(); im.className = 'snap'; im.src = c.toDataURL('image/jpeg', .88); slides[i].insertBefore(im, slides[i].firstChild); printed.push(im);
    (V2.stillLabels || []).forEach(function (l) { var d = el('div', { class: 'lb ' + l.cls + ' snaplb', style: '--s:1;position:absolute;left:' + l.x.toFixed(1) + 'px;top:' + l.y.toFixed(1) + 'px;display:block' }, '<i class="in">' + l.html + '</i>'); slides[i].appendChild(d); printed.push(d); });
  }
});
addEventListener('afterprint', function () { printed.forEach(function (n) { n.remove(); }); printed = []; });
D.printNow = function () { window.print(); };
if (Q.has('print')) setTimeout(function () { window.print(); }, 600);
};
})();
