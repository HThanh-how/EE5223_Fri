/* v2-cathode deck core: slides DOM, navigation, loop */
(function () {
'use strict';
var V2 = window.V2, S = window.SLIDES, Q = new URLSearchParams(location.search);
var $ = function (id) { return document.getElementById(id); };
var stage = $('stage'), slideEls = [], timers = [], N = S.length;
var D = V2.deck = { cur: 0, N: N, listeners: [], tools: {}, blackout: false, overview: false };
D.on = function (f) { D.listeners.push(f); };
var LAY = S.map(function(s,i){return i===0?'hero':(s.dia?'dia':'col');});
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function words(txt) { return txt.split(' ').map(function (w) { return '<span class="w">' + esc(w) + '</span>'; }).join(' '); }

/* ---------------------------------------------------------------- build */
function seg(items, attr, cls) {
  return '<div class="seg ' + (cls || '') + '" role="group">' + items.map(function (it) {
    return '<button type="button" tabindex="-1" data-' + attr + '="' + it[0] + '" aria-pressed="false">' + it[1] + '</button>';
  }).join('') + '</div>';
}
S.forEach(function (sl, i) {
  var sec = document.createElement('section'); sec.className = 'slide ' + LAY[i]; sec.id = 'sl' + i; sec.setAttribute('aria-label', 'Slide ' + (i + 1) + ' of ' + N + ': ' + sl.title);
  sec.setAttribute('aria-hidden', 'true');
  var hh = '<' + (i === 0 ? 'h1' : 'h2') + ' class="hl">' + words(sl.title) + '</' + (i === 0 ? 'h1' : 'h2') + '>';
  var ln = sl.lines.length ? '<div class="lines">' + sl.lines.map(function (l, k) { return '<p class="' + (i === 0 ? ['sub', 'who', 'where'][k] : '') + '">' + words(l) + '</p>'; }).join('') + '</div>' : '';
  var h = (LAY[i] === 'top' || LAY[i] === 'dia') ? '<div class="txt">' + hh + '</div>' + ln : '<div class="txt">' + hh + ln + '</div>';
  if (sl.svg) { h += '<div class="dwrap">' + sl.svg + '</div>'; }
  sec.innerHTML = h; stage.appendChild(sec); slideEls.push(sec);
});

/* ---------------------------------------------------------------- scaling stage */
function fit() {
  var w = innerWidth, h = innerHeight, k = Math.min(w / 1920, h / 1080);
  stage.style.transform = 'translate(' + ((w - 1920 * k) / 2).toFixed(1) + 'px,' + ((h - 1080 * k) / 2).toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
  document.documentElement.style.setProperty('--s', k.toFixed(4));
}
fit(); addEventListener('resize', function () { fit(); });

/* ---------------------------------------------------------------- reveal (terminal print) */
function clearTimers() { timers.forEach(clearTimeout); timers = []; }
function reveal(i) {
  clearTimers(); var ws = slideEls[i].querySelectorAll('.w'), k = 0;
  if (V2.STATIC || V2.REDUCE) { for (k = 0; k < ws.length; k++) ws[k].classList.add('on'); return; }
  for (k = 0; k < ws.length; k++) ws[k].classList.remove('on');
  ws.forEach(function (w, n) { timers.push(setTimeout(function () { w.classList.add('on'); }, 450 + n * 24)); });
}

/* ---------------------------------------------------------------- navigation */
function show(i, instant) {
  i = Math.max(0, Math.min(N - 1, i)); var prev = D.cur;
  slideEls.forEach(function (el, k) { var on = k === i; el.classList.toggle('on', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); });
  D.cur = i; reveal(i);
  if (V2.ok) V2.go(i, instant || i === prev && false);
  try { history.replaceState(null, '', location.pathname + location.search + '#' + (i + 1)); } catch (e) { }
  D.listeners.forEach(function (f) { f(i, prev); });
}
D.go = function (i) { if (D.blackout) D.setBlackout(false); show(i, false); };
D.next = function () { D.go(D.cur + 1); }; D.prev = function () { D.go(D.cur - 1); };

D.key = function(k) { var sc=V2.scenes[D.cur]; if(k==='s' && sc && sc.toggle) sc.toggle(); };

/* ---------------------------------------------------------------- loop */
var last = performance.now() / 1000, fpsEl = null, frameN = 0, started = performance.now() / 1000, still = 0;
D.paused = function () { return D.blackout || D.overview || document.hidden; };
function loop() {
  var now = performance.now() / 1000, dt = now - last; last = now;
  if (V2.ok && !D.paused()) {
    if (V2.STATIC) { if (still < 40) { V2.frame(1 / 60, 6); still++; } }
    else V2.frame(dt, now - started);
  }
  D.tick && D.tick(dt, now);
  if (fpsEl && (++frameN % 20 === 0)) { var i = V2.info ? V2.info() : { calls: 0, triangles: 0 }; fpsEl.textContent = V2.stats.fps.toFixed(0) + ' fps  ' + V2.stats.ms.toFixed(1) + ' ms  scale ' + V2.stats.scale.toFixed(1) + '  tier ' + V2.TIER + '  calls ' + (V2.ok ? V2.renderer.info.render.calls : 0) + '  paused ' + D.paused(); }
  requestAnimationFrame(loop);
}
V2.hooks.afterRender = function () { };

/* ---------------------------------------------------------------- boot */
function boot() {
  var ok = false;
  try { ok = V2.init(); } catch (e) { console.error('v2 init failed', e); ok = false; }
  if (!ok) { document.body.classList.add('nogl'); }
  var h = parseInt((location.hash || '').replace('#', ''), 10); var start = (h >= 1 && h <= N) ? h - 1 : 0;
  if (Q.has('stats')) { fpsEl = document.createElement('div'); fpsEl.id = 'stats'; document.body.appendChild(fpsEl); }
  show(start, true);
  if (V2.STATIC) { slideEls[start].querySelectorAll('.w').forEach(function (w) { w.classList.add('on'); }); }
  addEventListener('hashchange', function () { var n = parseInt((location.hash || '').replace('#', ''), 10); if (n >= 1 && n <= N && n - 1 !== D.cur) show(n - 1, false); });
  document.body.classList.add('ready'); if (V2.STATIC) document.body.classList.add('static');
  requestAnimationFrame(loop);
  if (window.V2TOOLS) window.V2TOOLS(D);
  if (Q.has('selftest')) selftest();
}
function selftest() {
  var errs = [], rep = document.createElement('pre'); rep.id = 'selftest'; document.body.appendChild(rep);
  addEventListener('error', function (e) { errs.push(String(e.message)); });
  var oe = console.error; console.error = function () { errs.push([].join.call(arguments, ' ')); oe.apply(console, arguments); };
  var i = 0, t0 = performance.now();
  (function step() {
    if (i < N) { try { D.go(i); if (V2.scenes[i] && V2.scenes[i].toggle) V2.scenes[i].toggle(); var el=slideEls[i].querySelector('.txt'); if(el && (el.getBoundingClientRect().right > innerWidth || el.getBoundingClientRect().bottom > innerHeight)) errs.push('overflow slide '+(i+1)); } catch (e) { errs.push('slide ' + (i + 1) + ': ' + e.message); } i++; setTimeout(step, 450); }
    else { var msg = 'SELFTEST ' + (errs.length ? 'FAIL' : 'OK') + ': ' + N + ' slides, ' + errs.length + ' errors, ' + (V2.ok ? 'webgl ' + V2.stats.fps.toFixed(0) + ' fps' : 'no webgl') + (errs.length ? '\n' + errs.join('\n') : ''); rep.textContent = msg; document.title = msg.split('\n')[0]; console.log(msg); }
  })();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
