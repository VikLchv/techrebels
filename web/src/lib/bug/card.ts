// Bug card helpers: background colors and patterns, severity, PNG export.
import { bugSVG, vbOf, COL, DARK_BG, SEVERITY, type BugConfig } from './render.js';

const INK = '#2A1416';

export const isDarkBg = (bg: string) => DARK_BG.includes(bg);
export const bgInk = (bg: string) => (isDarkBg(bg) ? 'rgba(255,255,255,.16)' : 'rgba(42,20,22,.12)');

export function hash(s: string) {
  let x = 2166136261;
  for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
export const severityOf = (cfg: BugConfig) => SEVERITY[(hash(JSON.stringify(cfg)) >>> 8) % SEVERITY.length];

/** A small repeating SVG tile for the card background pattern (scale k for high-res export). */
export function tileSVG(p: string, ink: string, k = 1) {
  const T = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * k}" height="${h * k}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  const ln = `fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (p) {
    case 'grid': return T(32, 32, `<path d="M0 .5H32M.5 0V32" ${ln} stroke-width="1.5"/>`);
    case 'dots': return T(28, 28, `<circle cx="14" cy="14" r="3" fill="${ink}"/>`);
    case 'checker': return T(48, 48, `<rect width="24" height="24" fill="${ink}"/><rect x="24" y="24" width="24" height="24" fill="${ink}"/>`);
    case 'stripes': return T(24, 24, `<path d="M-6 6L6 -6M-6 30L30 -6M18 30L30 18" ${ln} stroke-width="5"/>`);
    case 'code': return T(96, 72, `<path d="M18 14l-8 7 8 7M34 14l8 7-8 7M30 12l-8 18" ${ln} stroke-width="3"/><path d="M66 46c-5 0-5 3-5 6s0 4-4 4c4 0 4 1 4 4s0 6 5 6M80 46c5 0 5 3 5 6s0 4 4 4c-4 0-4 1-4 4s0 6-5 6" ${ln} stroke-width="3"/>`);
    case 'sparkles': return T(90, 90, `<path d="M22 8Q22 22 36 22Q22 22 22 36Q22 22 8 22Q22 22 22 8Z" fill="${ink}"/><path d="M66 52Q66 62 76 62Q66 62 66 72Q66 62 56 62Q66 62 66 52Z" fill="${ink}"/>`);
    case 'bugs': return T(70, 70, `<ellipse cx="20" cy="22" rx="10" ry="9" fill="${ink}"/><circle cx="20" cy="11" r="5" fill="${ink}"/><path d="M17 7l-3-5M23 7l3-5M10 19l-5-2M30 19l5-2M10 26l-5 3M30 26l5 3" ${ln} stroke-width="2"/><ellipse cx="54" cy="56" rx="7" ry="6" fill="${ink}"/><circle cx="54" cy="48" r="3.5" fill="${ink}"/>`);
  }
  return '';
}

export function applyCardBg(el: HTMLElement, bg: string, p: string) {
  el.style.backgroundColor = COL[bg] ?? COL.green;
  const ink = bgInk(bg);
  if (p === 'sunburst') el.style.backgroundImage = `repeating-conic-gradient(from 0deg at 50% 52%, ${ink} 0deg 9deg, transparent 9deg 20deg)`;
  else if (tileSVG(p, ink)) el.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(tileSVG(p, ink))}")`;
  else el.style.backgroundImage = 'none';
}

const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** 1080x1350 PNG of the bug card. Text is drawn with canvas, never put into the SVG. */
export async function renderCardPNG(cfg: BugConfig & { bg?: string; bgpattern?: string }, meta: { id: string; name: string; line: string; quip: string }) {
  try { await document.fonts.ready; } catch {}
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const bg = String(cfg.bg ?? 'green'), ink = bgInk(bg), txt = isDarkBg(bg) ? COL.pink : INK;
  ctx.fillStyle = COL[bg] ?? COL.green; ctx.fillRect(0, 0, W, H);
  if (cfg.bgpattern === 'sunburst') {
    ctx.fillStyle = ink;
    const cx = W / 2, cy = 560, R = 1600, step = (20 * Math.PI) / 180, wedge = (9 * Math.PI) / 180;
    for (let a = -Math.PI / 2; a < 1.5 * Math.PI; a += step) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      ctx.lineTo(cx + R * Math.cos(a + wedge), cy + R * Math.sin(a + wedge));
      ctx.closePath(); ctx.fill();
    }
  } else if (cfg.bgpattern && tileSVG(String(cfg.bgpattern), ink)) {
    const tile = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(tileSVG(String(cfg.bgpattern), ink, 2.5)));
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!; ctx.fillRect(0, 0, W, H);
  }
  const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bugSVG(cfg, 780)));
  const vb = vbOf(cfg), bw = 780;
  ctx.drawImage(img, (W - bw) / 2, 70, bw, (bw * vb[1]) / 300);
  ctx.fillStyle = txt;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 64px "Bricolage Grotesque", "Arial Black", sans-serif';
  ctx.fillText('tech', 64, 120); ctx.fillText('Rebels', 64, 172);
  ctx.font = '700 30px "JetBrains Mono", monospace';
  ctx.textAlign = 'right'; ctx.fillText(meta.id, W - 64, 110); ctx.textAlign = 'left';
  let size = 128;
  do { ctx.font = `800 ${size}px "Bricolage Grotesque", "Arial Black", sans-serif`; size -= 4; } while (ctx.measureText(meta.name).width > W - 128 && size > 40);
  ctx.fillText(meta.name, 64, 1170);
  ctx.font = '500 36px "JetBrains Mono", monospace';
  ctx.fillText(meta.line, 64, 1236);
  ctx.font = '500 34px "Satoshi", "Figtree", sans-serif';
  ctx.globalAlpha = 0.85; ctx.fillText(meta.quip, 64, 1290); ctx.globalAlpha = 1;
  return cv.toDataURL('image/png');
}
