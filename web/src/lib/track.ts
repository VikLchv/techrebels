// Cookieless analytics. Events go to the Supabase table analytics_events (insert only).
// No cookies, no personal data: a random id per browser tab, the page, what was clicked.
// Sends only in production builds (or with ?track=1), never when the browser asks Do Not Track.

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;

type Ev = { session_id: string; event: string; path: string; label?: string | null; section?: string | null; props?: Record<string, unknown>; viewport: string; referrer?: string | null };

const dnt = typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('track');
const enabled = !!URL_ && !!KEY && !dnt && (import.meta.env.PROD || forced);

const sid = (() => {
  try {
    let id = sessionStorage.getItem('tr-sid');
    if (!id) { id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('tr-sid', id); }
    return id;
  } catch { return 'nostorage' + Math.random().toString(36).slice(2, 10); }
})();

const viewport = () => (innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop');
const clip = (s: string | null | undefined, n: number) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, n) : null);

let queue: Ev[] = [];
let timer = 0;

function flush(useBeacon = false) {
  if (!queue.length || !enabled) { queue = []; return; }
  const body = JSON.stringify(queue);
  queue = [];
  fetch(`${URL_}/rest/v1/analytics_events`, {
    method: 'POST',
    keepalive: useBeacon,
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body,
  }).catch(() => {});
}

export function track(event: string, label?: string | null, extra: { section?: string | null; props?: Record<string, unknown> } = {}) {
  const ev: Ev = {
    session_id: sid,
    event: event.toLowerCase().replace(/[^a-z0-9_:.-]/g, '_').slice(0, 60),
    path: location.pathname.slice(0, 200),
    label: clip(label, 120),
    section: clip(extra.section, 60),
    props: extra.props ?? {},
    viewport: viewport(),
    referrer: event === 'pageview' ? clip(document.referrer ? new URL(document.referrer).host : null, 200) : null,
  };
  if (!import.meta.env.PROD) console.debug('[track]', ev.event, ev.label ?? '', ev.section ?? '', ev.props);
  (window as Window & { plausible?: (e: string, o?: object) => void }).plausible?.(ev.event, { props: { label: ev.label, section: ev.section } });
  if (!enabled) return;
  queue.push(ev);
  clearTimeout(timer);
  timer = window.setTimeout(() => flush(), 2000);
}

/** Page views, clicks on anything clickable, scroll depth, intro, bugs released. */
export function autoTrack() {
  track('pageview', document.title);

  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>('a, button, summary, [data-track]');
    if (!el) return;
    const label = el.dataset.track || el.getAttribute('aria-label') || el.textContent || (el as HTMLAnchorElement).href;
    const section = el.closest<HTMLElement>('section[id]')?.id ?? (el.closest('header') ? 'nav' : el.closest('footer') ? 'footer' : el.closest('#intro') ? 'intro' : null);
    const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : undefined;
    track('click', label, { section, props: href ? { href } : {} });
  }, { capture: true });

  const marks = [25, 50, 75, 100];
  const seen = new Set<number>();
  addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max <= 0) return;
    const pct = (scrollY / max) * 100;
    for (const m of marks) if (pct >= m - 1 && !seen.has(m)) { seen.add(m); track('scroll', `${m}%`); }
  }, { passive: true });

  document.addEventListener('tr:intro', (e) => track('intro', (e as CustomEvent<string>).detail));

  let start = -1, bugs = 0;
  document.addEventListener('tr:count', (e) => {
    const n = (e as CustomEvent<number>).detail;
    if (start < 0 && n > 0) start = n;
    bugs = Math.max(bugs, n);
  });

  addEventListener('pagehide', () => {
    if (start >= 0 && bugs > start) track('bugs_released', String(bugs - start));
    flush(true);
  });
}
