// Generates public/favicon.svg and og.html (rendered to public/og.png with headless Chrome).
// Usage: node scripts/gen-assets.mjs   then screenshot og.html at 1200x630.
import { writeFileSync, mkdirSync } from 'node:fs';
import { bugSVG } from '../src/lib/bug/render.js';

const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

// favicon: a green bug on a pink rounded square (24% radius)
const fav = bugSVG({ role: 'curious', shape: 'round', shell: 'green', pattern: 'code', eyes: 'visor', mouth: 'grin', antennae: 'plug', hat: 'none' }, 300);
writeFileSync('public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#F4A5D4"/>` +
  `<svg x="5" y="3" width="54" height="60" viewBox="0 -12 300 332">${inner(fav)}</svg></svg>`);

// Open Graph image
const og = bugSVG({ role: 'dev', shape: 'round', shell: 'green', pattern: 'circuit', eyes: 'visor', mouth: 'grin', antennae: 'plug', hat: 'headphones', pose: 'stomp', attitude: 'rebel', accent: 'mint' }, 420);
mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/og.html', `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=JetBrains+Mono:wght@700&display=block">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{background:#0B0F0D;background-image:linear-gradient(rgba(237,231,220,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(237,231,220,.05) 1px,transparent 1px);background-size:60px 60px;position:relative;font-family:'JetBrains Mono',monospace}
.wm{position:absolute;left:70px;top:80px;font:800 190px/.8 'Bricolage Grotesque',sans-serif;letter-spacing:-.05em;color:#F4A5D4}
.wm span{display:block}
.claim{position:absolute;left:76px;top:470px;color:#CDDC27;font-weight:700;font-size:30px;letter-spacing:.04em}
.os{position:absolute;left:76px;top:40px;color:#8E9A94;font-size:18px;letter-spacing:.14em}
.tile{position:absolute;right:70px;top:70px;width:420px;padding:14px;background:#CDDC27;border-radius:26px;transform:rotate(-3deg);box-shadow:10px 10px 0 #F4A5D4}
.tile svg{display:block;width:100%;height:auto}
</style></head><body>
<div class="os">TECHREBELS.OS</div>
<div class="wm"><span>tech</span><span>Rebels</span></div>
<div class="claim">SERIOUS TECH. UNSERIOUS PEOPLE.</div>
<div class="tile">${og}</div>
</body></html>`);
console.log('ok');
