type RushHooks = {
  onTick: (state: { score: number; combo: number; lives: number }) => void;
  onEnd: (state: { score: number; durationMs: number; path: number[] }) => void;
};

/** A duel run: the map comes from the seed, the ghost replays the other player's path. */
export type RushRun = { seed?: number; ghost?: { path: number[]; svg: string; label: string } };

// small deterministic PRNG, so both duel players get the same spawns in the same order
const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const PATH_STEP_MS = 100; // one ghost sample every 100 ms, stored as x,y in 0..1000
const PATH_MAX = 6000;

type Orb = { x: number; y: number; r: number; pulse: number };
type Hazard = { x: number; y: number; w: number; h: number; vx: number; vy: number; label: string; hit: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Enemy = { x: number; y: number; r: number; speed: number; wobble: number; dead: boolean };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number };

export function createBugRush(canvas: HTMLCanvasElement, bugSvg: string, hooks: RushHooks) {
  const context = canvas.getContext('2d')!;
  const keys = new Set<string>();
  const player = { x: 0, y: 0, r: 27, invulnerable: 0 };
  const pointer = { x: 0, y: 0, active: false };
  const orbs: Orb[] = [];
  const hazards: Hazard[] = [];
  const particles: Particle[] = [];
  const enemies: Enemy[] = [];
  const bullets: Bullet[] = [];
  const labels = ['MEETING', 'DEADLINE', 'CC ALL', 'SCOPE CREEP', 'APPROVAL'];
  const image = new Image();
  const imageUrl = URL.createObjectURL(new Blob([bugSvg], { type: 'image/svg+xml' }));
  image.src = imageUrl;
  let width = 800, height = 500, dpr = 1, raf = 0, last = 0, started = 0, running = false, destroyed = false;
  let score = 0, combo = 1, lives = 3, orbClock = 0, hazardClock = 0, enemyClock = 0, shake = 0, lastShot = 0;
  let lastDirection = { x: 0, y: -1 };
  let rng: () => number = Math.random;
  let path: number[] = [], nextSample = 0;
  let ghost: { path: number[]; label: string; image: HTMLImageElement; url: string } | null = null;

  // rand is for effects only; grand drives the map so seeded runs match
  const rand = (min: number, max: number) => min + Math.random() * (max - min);
  const grand = (min: number, max: number) => min + rng() * (max - min);
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = Math.min(devicePixelRatio || 1, 2);
    const nextWidth = Math.max(320, rect.width), nextHeight = Math.max(360, rect.height);
    const pixelWidth = Math.round(nextWidth * nextDpr), pixelHeight = Math.round(nextHeight * nextDpr);
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    dpr = nextDpr; width = nextWidth; height = nextHeight;
    canvas.width = pixelWidth; canvas.height = pixelHeight;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!player.x) { player.x = width / 2; player.y = height * .72; }
    player.x = Math.min(width - player.r, Math.max(player.r, player.x));
    player.y = Math.min(height - player.r, Math.max(player.r, player.y));
  };
  const addOrb = () => orbs.push({ x: grand(35, width - 35), y: grand(55, height - 45), r: grand(10, 14), pulse: rand(0, Math.PI * 2) });
  const addHazard = (progress: number) => {
    const w = grand(78, 126), h = grand(34, 47);
    hazards.push({ x: grand(4, Math.max(5, width - w - 4)), y: -h - 10, w, h, vx: grand(-22, 22), vy: grand(105, 155) + progress * 90, label: labels[Math.floor(rng() * labels.length)], hit: false });
  };
  const addEnemy = (progress: number) => {
    const edge = Math.floor(rng() * 4), r = grand(18, 25); let x = 0, y = 0;
    if (edge === 0) { x = grand(r, width - r); y = -r; }
    else if (edge === 1) { x = width + r; y = grand(r, height - r); }
    else if (edge === 2) { x = grand(r, width - r); y = height + r; }
    else { x = -r; y = grand(r, height - r); }
    enemies.push({ x, y, r, speed: grand(58, 82) + progress * 65, wobble: grand(0, Math.PI * 2), dead: false });
  };
  const burst = (x: number, y: number, color: string, count: number) => { for (let i = 0; i < count; i++) particles.push({ x, y, vx: rand(-150, 150), vy: rand(-150, 150), life: rand(.35, .75), color }); };
  const overlapCircle = (x: number, y: number, r: number) => Math.hypot(player.x - x, player.y - y) < player.r + r;
  const overlapBox = (h: Hazard) => player.x + player.r > h.x && player.x - player.r < h.x + h.w && player.y + player.r > h.y && player.y - player.r < h.y + h.h;
  const takeLife = (x: number, y: number) => { if (player.invulnerable > 0) return; lives--; combo = 1; player.invulnerable = 1.25; shake = 11; burst(x, y, '#F4A5D4', 20); };
  const shoot = (targetX?: number, targetY?: number) => {
    if (!running || performance.now() - lastShot < 240) return;
    let dx = (targetX ?? player.x + lastDirection.x * 100) - player.x, dy = (targetY ?? player.y + lastDirection.y * 100) - player.y;
    if (targetX === undefined) { const nearest = enemies.filter(e => !e.dead).sort((a,b) => Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0]; if (nearest) { dx = nearest.x - player.x; dy = nearest.y - player.y; } }
    const length = Math.hypot(dx, dy) || 1; bullets.push({ x: player.x, y: player.y, vx: dx / length * 520, vy: dy / length * 520, life: 1.3 }); lastShot = performance.now(); burst(player.x + dx / length * 28, player.y + dy / length * 28, '#3DDB9A', 4);
  };

  const update = (dt: number, now: number) => {
    const elapsed = now - started, progress = Math.min(1, elapsed / 120_000);
    let dx = 0, dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx--; if (keys.has('arrowright') || keys.has('d')) dx++;
    if (keys.has('arrowup') || keys.has('w')) dy--; if (keys.has('arrowdown') || keys.has('s')) dy++;
    if (dx || dy) { const l = Math.hypot(dx, dy); lastDirection={x:dx/l,y:dy/l}; player.x += lastDirection.x * 330 * dt; player.y += lastDirection.y * 330 * dt; pointer.active = false; }
    else if (pointer.active) { const px = pointer.x - player.x, py = pointer.y - player.y, distance = Math.hypot(px, py); if (distance > 4) { const speed = Math.min(390, distance * 7); lastDirection={x:px/distance,y:py/distance}; player.x += lastDirection.x * speed * dt; player.y += lastDirection.y * speed * dt; } }
    player.x = Math.max(player.r, Math.min(width - player.r, player.x)); player.y = Math.max(player.r, Math.min(height - player.r, player.y));
    player.invulnerable = Math.max(0, player.invulnerable - dt); shake = Math.max(0, shake - dt * 28);

    orbClock -= dt; if (orbClock <= 0 && orbs.length < 4) { addOrb(); orbClock = Math.max(.32, .72 - progress * .25); }
    hazardClock -= dt; if (hazardClock <= 0) { addHazard(progress); hazardClock = Math.max(.48, 1.25 - progress * .63); }
    enemyClock -= dt; if (enemyClock <= 0) { addEnemy(progress); enemyClock = Math.max(.7, 2.2 - progress * 1.25); }
    for (let i = orbs.length - 1; i >= 0; i--) if (overlapCircle(orbs[i].x, orbs[i].y, orbs[i].r)) { score += 100 * combo; combo = Math.min(8, combo + 1); burst(orbs[i].x, orbs[i].y, '#CDDC27', 12); orbs.splice(i, 1); }
    hazards.forEach(h => { h.x += h.vx * dt; h.y += h.vy * dt; if (!h.hit && player.invulnerable <= 0 && overlapBox(h)) { h.hit = true; takeLife(player.x, player.y); } });
    enemies.forEach(e => { const ex=player.x-e.x,ey=player.y-e.y,length=Math.hypot(ex,ey)||1;e.wobble+=dt*4;e.x+=(ex/length*e.speed+Math.sin(e.wobble)*18)*dt;e.y+=(ey/length*e.speed+Math.cos(e.wobble)*18)*dt;if(!e.dead&&overlapCircle(e.x,e.y,e.r)){e.dead=true;takeLife(player.x,player.y);} });
    bullets.forEach(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;enemies.forEach(e=>{if(!e.dead&&Math.hypot(b.x-e.x,b.y-e.y)<e.r+6){e.dead=true;b.life=0;score+=250*combo;combo=Math.min(8,combo+1);burst(e.x,e.y,'#3DDB9A',16);}});});
    for (let i = hazards.length - 1; i >= 0; i--) if (hazards[i].y > height + 70 || hazards[i].x < -180 || hazards[i].x > width + 180) hazards.splice(i, 1);
    for(let i=enemies.length-1;i>=0;i--)if(enemies[i].dead)enemies.splice(i,1);for(let i=bullets.length-1;i>=0;i--)if(bullets[i].life<=0||bullets[i].x<0||bullets[i].x>width||bullets[i].y<0||bullets[i].y>height)bullets.splice(i,1);
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
    if (elapsed >= nextSample && path.length < PATH_MAX) { path.push(Math.round(player.x / width * 1000), Math.round(player.y / height * 1000)); nextSample += PATH_STEP_MS; }
    hooks.onTick({ score, combo, lives });
    if (lives <= 0) { running = false; hooks.onEnd({ score, durationMs: Math.round(now - started), path: path.slice() }); }
  };

  const rounded = (x: number, y: number, w: number, h: number, r: number) => { context.beginPath(); context.roundRect(x, y, w, h, r); };
  const draw = (now: number) => {
    context.save();
    const jx = shake ? rand(-shake, shake) : 0, jy = shake ? rand(-shake, shake) : 0; context.translate(jx, jy);
    context.fillStyle = '#0B0F0D'; context.fillRect(-12, -12, width + 24, height + 24);
    context.strokeStyle = 'rgba(237,231,220,.055)'; context.lineWidth = 1;
    for (let x = 0; x < width; x += 42) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 0; y < height; y += 42) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
    orbs.forEach(o => { const pulse = 1 + Math.sin(now / 170 + o.pulse) * .15; context.shadowColor = '#CDDC27'; context.shadowBlur = 18; context.fillStyle = '#CDDC27'; context.beginPath(); context.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0; context.fillStyle = '#0B0F0D'; context.font = '900 12px monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('+', o.x, o.y + 1); });
    hazards.forEach(h => { context.save(); context.globalAlpha = h.hit ? .35 : 1; rounded(h.x, h.y, h.w, h.h, 10); context.fillStyle = '#F4A5D4'; context.fill(); context.strokeStyle = '#2A1416'; context.lineWidth = 3; context.stroke(); context.fillStyle = '#2A1416'; context.font = `800 ${h.label.length > 9 ? 10 : 12}px monospace`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(h.label, h.x + h.w / 2, h.y + h.h / 2 + 1); context.restore(); });
    enemies.forEach(e=>{context.save();context.translate(e.x,e.y);context.rotate(Math.sin(e.wobble)*.12);context.fillStyle='#7A304F';context.strokeStyle='#F4A5D4';context.lineWidth=3;context.beginPath();context.arc(0,0,e.r,0,Math.PI*2);context.fill();context.stroke();context.beginPath();context.moveTo(-e.r*.7,-e.r*.65);context.lineTo(-e.r*.25,-e.r*1.15);context.lineTo(-e.r*.05,-e.r*.65);context.moveTo(e.r*.7,-e.r*.65);context.lineTo(e.r*.25,-e.r*1.15);context.lineTo(e.r*.05,-e.r*.65);context.stroke();context.fillStyle='#CDDC27';context.beginPath();context.arc(-e.r*.35,-2,4,0,Math.PI*2);context.arc(e.r*.35,-2,4,0,Math.PI*2);context.fill();context.strokeStyle='#0B0F0D';context.lineWidth=3;context.beginPath();context.moveTo(-e.r*.42,e.r*.42);context.lineTo(0,e.r*.2);context.lineTo(e.r*.42,e.r*.42);context.stroke();context.restore();});
    bullets.forEach(b=>{context.shadowColor='#3DDB9A';context.shadowBlur=12;context.fillStyle='#3DDB9A';context.beginPath();context.arc(b.x,b.y,6,0,Math.PI*2);context.fill();context.shadowBlur=0;});
    particles.forEach(p => { context.globalAlpha = Math.min(1, p.life * 2); context.fillStyle = p.color; context.fillRect(p.x - 3, p.y - 3, 6, 6); }); context.globalAlpha = 1;
    if (ghost && running && ghost.path.length >= 2) {
      const t = (now - started) / PATH_STEP_MS, i = Math.floor(t), n = ghost.path.length / 2;
      const gone = i >= n - 1, a = Math.min(i, n - 1), b = Math.min(i + 1, n - 1), f = gone ? 0 : t - i;
      const gx = (ghost.path[a * 2] + (ghost.path[b * 2] - ghost.path[a * 2]) * f) / 1000 * width;
      const gy = (ghost.path[a * 2 + 1] + (ghost.path[b * 2 + 1] - ghost.path[a * 2 + 1]) * f) / 1000 * height;
      context.save(); context.globalAlpha = gone ? .14 : .38; context.translate(gx, gy);
      if (ghost.image.complete) context.drawImage(ghost.image, -40, -43, 80, 88);
      context.globalAlpha = gone ? .3 : .8; context.fillStyle = '#EDE7DC'; context.font = '700 11px monospace'; context.textAlign = 'center';
      context.fillText(gone ? `${ghost.label} · out` : ghost.label, 0, -50); context.restore();
    }
    context.save(); if (player.invulnerable > 0 && Math.floor(player.invulnerable * 12) % 2) context.globalAlpha = .28; context.translate(player.x, player.y); const bob = running ? Math.sin(now / 100) * 3 : Math.sin(now / 300) * 4; context.rotate(Math.sin(now / 240) * .025); if (image.complete) context.drawImage(image, -48, -51 + bob, 96, 106); else { context.fillStyle = '#3DDB9A'; context.beginPath(); context.arc(0, bob, 28, 0, Math.PI * 2); context.fill(); } context.restore();
    context.restore();
  };
  const loop = (now: number) => { if (destroyed) return; resize(); const dt = Math.min(.034, (now - (last || now)) / 1000); last = now; if (running) update(dt, now); draw(now); raf = requestAnimationFrame(loop); };
  const position = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top; pointer.active = true; };
  const down = (event: PointerEvent) => { canvas.setPointerCapture?.(event.pointerId); position(event); shoot(pointer.x,pointer.y); };
  const move = (event: PointerEvent) => { if (event.pointerType === 'mouse' || canvas.hasPointerCapture?.(event.pointerId)) position(event); };
  const up = (event: PointerEvent) => { if (event.pointerType !== 'mouse') pointer.active = false; };
  const keyDown = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); if (['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(key)) { if (running) event.preventDefault(); keys.add(key); } if(key===' '&&running){event.preventDefault();shoot();} };
  const keyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
  resize(); addOrb(); addOrb(); raf = requestAnimationFrame(loop);
  return {
    start(run: RushRun = {}) {
      rng = run.seed !== undefined ? mulberry32(run.seed) : Math.random;
      path = []; nextSample = 0;
      if (ghost) { URL.revokeObjectURL(ghost.url); ghost = null; }
      if (run.ghost && run.ghost.path.length >= 2) {
        const url = URL.createObjectURL(new Blob([run.ghost.svg], { type: 'image/svg+xml' }));
        const img = new Image(); img.src = url;
        ghost = { path: run.ghost.path, label: run.ghost.label, image: img, url };
      }
      score = 0; combo = 1; lives = 3; orbs.length = hazards.length = particles.length = enemies.length = bullets.length = 0; player.x = width / 2; player.y = height * .72; player.invulnerable = 0; pointer.active = false; addOrb(); addOrb(); orbClock = .4; hazardClock = 1; enemyClock = 2; started = performance.now(); last = started; running = true; hooks.onTick({ score: 0, combo: 1, lives: 3 }); },
    fire() { shoot(); },
    stop() { running = false; keys.clear(); pointer.active = false; },
    destroy() { destroyed = true; running = false; cancelAnimationFrame(raf); URL.revokeObjectURL(imageUrl); if (ghost) URL.revokeObjectURL(ghost.url); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); },
    isRunning: () => running,
  };
}
