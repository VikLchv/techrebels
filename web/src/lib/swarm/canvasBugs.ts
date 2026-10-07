// Tiny top-down canvas bugs, shared by the intro and the ambient layer.
// Stored in typed arrays and drawn in batches per color so a thousand bugs stay at 60fps.

export const NIGHT = '#0B0F0D';
// pink, lime, mint, bone, brown
export const BUG_COLORS = ['#F4A5D4', '#CDDC27', '#3DDB9A', '#EDE7DC', '#8C5A3C'];
const WEIGHTS = [0.28, 0.28, 0.24, 0.12, 0.08];

export function pickColor(): number {
  let r = Math.random();
  for (let i = 0; i < WEIGHTS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return i;
  }
  return 0;
}

const TAU = Math.PI * 2;
const LEGS = [-0.55, 0, 0.55];

export class Swarm {
  readonly max: number;
  n = 0;
  x: Float32Array; y: Float32Array; vx: Float32Array; vy: Float32Array;
  tx: Float32Array; ty: Float32Array; s: Float32Array; ph: Float32Array; ang: Float32Array;
  col: Uint8Array;
  alpha = 1;
  W = 0;
  H = 0;
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement, max: number) {
    this.max = max;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.tx = new Float32Array(max); this.ty = new Float32Array(max);
    this.s = new Float32Array(max); this.ph = new Float32Array(max); this.ang = new Float32Array(max);
    this.col = new Uint8Array(max);
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Both swarm canvases cover the viewport. Measure the window, not the canvas:
    // before CSS applies, a canvas reports its default 300x150 size.
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  add(x: number, y: number, vx: number, vy: number, s: number, col = pickColor()): number {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.s[i] = s; this.col[i] = col;
    this.ph[i] = Math.random() * TAU;
    this.ang[i] = Math.atan2(vy, vx);
    this.tx[i] = x; this.ty[i] = y;
    return i;
  }

  /** Move by velocity, turn toward the direction of travel, advance the leg swing. */
  step(i: number) {
    const vx = this.vx[i], vy = this.vy[i];
    this.x[i] += vx;
    this.y[i] += vy;
    const sp = Math.hypot(vx, vy);
    if (sp > 0.15) {
      let d = Math.atan2(vy, vx) - this.ang[i];
      d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
      this.ang[i] += d * 0.35;
    }
    this.ph[i] += 0.08 + sp * 0.45;
  }

  draw() {
    const { ctx, n } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    if (!n) return;
    ctx.globalAlpha = this.alpha;
    let avg = 0;
    for (let i = 0; i < n; i++) avg += this.s[i];
    avg /= n;
    ctx.lineCap = 'round';

    for (let c = 0; c < BUG_COLORS.length; c++) {
      ctx.strokeStyle = ctx.fillStyle = BUG_COLORS[c];
      ctx.lineWidth = Math.max(1, avg * 0.26);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const s = this.s[i];
        if (this.col[i] !== c || s < 2.2) continue;
        const x = this.x[i], y = this.y[i], cs = Math.cos(this.ang[i]), sn = Math.sin(this.ang[i]);
        for (let k = 0; k < 3; k++) {
          for (let side = -1; side <= 1; side += 2) {
            const lx = LEGS[k] * s;
            const sw = Math.sin(this.ph[i] + k * 2.1 + side * 1.6) * s * 0.45;
            const ax = lx, ay = side * s * 0.55, ex = lx + sw, ey = side * s * 1.45;
            ctx.moveTo(x + ax * cs - ay * sn, y + ax * sn + ay * cs);
            ctx.lineTo(x + ex * cs - ey * sn, y + ex * sn + ey * cs);
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const ax = s * 1.45, ay = side * s * 0.2, ex = s * 2.15, ey = side * s * 0.75;
          ctx.moveTo(x + ax * cs - ay * sn, y + ax * sn + ay * cs);
          ctx.lineTo(x + ex * cs - ey * sn, y + ex * sn + ey * cs);
        }
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (this.col[i] !== c) continue;
        const s = this.s[i], x = this.x[i], y = this.y[i], a = this.ang[i];
        const cs = Math.cos(a), sn = Math.sin(a);
        ctx.moveTo(x + s * cs, y + s * sn);
        ctx.ellipse(x, y, s, s * 0.78, a, 0, TAU);
        const hx = x + cs * s * 1.12, hy = y + sn * s * 1.12, hr = s * 0.5;
        ctx.moveTo(hx + hr, hy);
        ctx.arc(hx, hy, hr, 0, TAU);
      }
      ctx.fill();
    }

    // seam down the shell
    ctx.strokeStyle = NIGHT;
    ctx.lineWidth = Math.max(0.8, avg * 0.16);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const s = this.s[i];
      if (s < 2.5) continue;
      const x = this.x[i], y = this.y[i], cs = Math.cos(this.ang[i]), sn = Math.sin(this.ang[i]);
      ctx.moveTo(x + cs * s * 0.55, y + sn * s * 0.55);
      ctx.lineTo(x - cs * s * 0.85, y - sn * s * 0.85);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
