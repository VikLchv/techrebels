// The Swarm orbit: saved bugs circling the techRebels wordmark on elliptical rings.
// DOM elements moved with CSS transforms; front half bigger and above the wordmark.
import { bugSVG } from '../bug/render.js';

export type SwarmBug = { bug_number: number; name: string; role: string; species?: number; config: Record<string, unknown>; created_at: string };

type Item = { b: SwarmBug; el: HTMLElement; ring: number; a: number; bob: number };

const RINGS = [
  { rx: 0.25, ry: 0.29, speed: 0.15, cap: 8 },
  { rx: 0.35, ry: 0.37, speed: -0.105, cap: 12 },
  { rx: 0.44, ry: 0.45, speed: 0.075, cap: 16 },
  { rx: 0.52, ry: 0.53, speed: -0.055, cap: 22 },
];
const MAX = RINGS.reduce((n, r) => n + r.cap, 0);

export const bugId = (n: number) => `BUG-${String(n).padStart(4, '0')}`;

export function createOrbit(stage: HTMLElement, opts: { bugWidth?: string } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items: Item[] = [];
  let paused = reduce, last = 0, clock = 0, visible = true, raf = 0;
  if (opts.bugWidth) stage.style.setProperty('--bw', opts.bugWidth);

  function layout() {
    // newest bugs fill the inner rings first
    let i = 0;
    RINGS.forEach((ring, r) => {
      const n = Math.min(ring.cap, items.length - i);
      for (let k = 0; k < n; k++, i++) {
        const it = items[i];
        it.ring = r;
        it.a = (k / n) * Math.PI * 2 + r * 0.7;
        it.el.hidden = false;
      }
    });
    for (; i < items.length; i++) items[i].el.hidden = true;
    place(0);
  }

  function makeEl(b: SwarmBug) {
    const el = document.createElement('div');
    el.className = 'ob';
    el.dataset.n = String(b.bug_number);
    el.title = `${b.name} · ${bugId(b.bug_number)}`;
    el.innerHTML = bugSVG(b.config, 160);
    const tag = document.createElement('span');
    tag.className = 'ob-tag';
    tag.textContent = b.name; // text only, never HTML
    el.appendChild(tag);
    stage.appendChild(el);
    return el;
  }

  function place(dt: number) {
    const W = stage.clientWidth, H = stage.clientHeight;
    clock += dt;
    for (const it of items) {
      if (it.el.hidden) continue;
      const ring = RINGS[it.ring];
      it.a += ring.speed * dt;
      const depth = (Math.sin(it.a) + 1) / 2;
      const s = 0.72 + depth * 0.42;
      const w = it.el.offsetWidth;
      const x = W / 2 + Math.cos(it.a) * ring.rx * W - w / 2;
      const y = H / 2 + Math.sin(it.a) * ring.ry * H - w * 0.55 + Math.sin(clock * 3 + it.bob) * 4;
      it.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      it.el.style.zIndex = String(depth > 0.62 ? 600 + Math.round(depth * 100) : Math.round(depth * 100));
    }
  }

  function tick(ts: number) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    if (!paused && visible && !document.hidden) place(dt);
  }
  raf = requestAnimationFrame(tick);
  addEventListener('resize', () => place(0));
  addEventListener('scroll', () => {
    const r = stage.getBoundingClientRect();
    visible = r.bottom > 0 && r.top < innerHeight;
  }, { passive: true });

  return {
    get count() { return items.length; },
    get max() { return MAX; },
    /** Replace all bugs (newest first). */
    set(bugs: SwarmBug[]) {
      for (const it of items) it.el.remove();
      items.length = 0;
      for (const b of bugs) items.push({ b, el: makeEl(b), ring: 0, a: 0, bob: Math.random() * 6.28 });
      layout();
    },
    /** A new bug flies in on the inner ring with a NEW pill. */
    add(b: SwarmBug) {
      if (items.some((it) => it.b.bug_number === b.bug_number)) return;
      const el = makeEl(b);
      el.classList.add('is-new');
      setTimeout(() => el.classList.remove('is-new'), 6000);
      items.unshift({ b, el, ring: 0, a: 0, bob: Math.random() * 6.28 });
      layout();
    },
    /** Dim everyone except bug n (or clear with null). Returns false if n is not in the swarm. */
    highlight(n: number | null, label = 'YOU') {
      stage.classList.toggle('finding', n !== null);
      let found = false;
      for (const it of items) {
        const me = it.b.bug_number === n;
        it.el.classList.toggle('me', me);
        if (me) it.el.dataset.label = label;
        if (me) { found = true; it.el.hidden = false; }
      }
      return found;
    },
    togglePause() { paused = !paused; return paused; },
    stop() { cancelAnimationFrame(raf); },
  };
}
