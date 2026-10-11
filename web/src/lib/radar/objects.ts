// Radar objects: small IT things (terminals, floppies, chips, badges...) that carry a topic.
// Each one shows its vote count and a short tag right on the object.

type Theme = { body: string; face: string; ink: string; line: string };
type Info = { votes: number; tag: string };

const THEMES: Record<string, Theme> = {
  bugs: { body: '#342450', face: '#3DDB9A', ink: '#0B0F0D', line: '#B7A6E0' },
  rebels: { body: '#114F40', face: '#F4A5D4', ink: '#0B0F0D', line: '#7FD9B5' },
  lunapark: { body: '#CDDC27', face: '#342450', ink: '#0B0F0D', line: '#0B0F0D' },
  person: { body: '#F4A5D4', face: '#EDE7DC', ink: '#2A1416', line: '#2A1416' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const MONO = 'font-family="JetBrains Mono, Consolas, monospace" font-weight="800"';
// long tags get squeezed to fit instead of spilling off the object
const txt = (x: number, y: number, size: number, fill: string, s: string, anchor = 'middle', max = 64) => {
  const fit = s.length * size * 0.62 > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${fit} ${MONO}>${esc(s)}</text>`;
};
const S = (t: Theme) => `stroke="${t.line}" stroke-width="3" stroke-linejoin="round"`;

const SHAPES: Record<string, (t: Theme, i: Info) => string> = {
  terminal: (t, i) => `
    <rect x="6" y="16" width="88" height="68" rx="10" fill="${t.body}" ${S(t)}/>
    <path d="M7.5 30 V26 a8.5 8.5 0 0 1 8.5 -8.5 H84 a8.5 8.5 0 0 1 8.5 8.5 V30 Z" fill="${t.face}"/>
    <circle cx="17" cy="24" r="2.6" fill="${t.ink}"/><circle cx="25" cy="24" r="2.6" fill="${t.ink}"/><circle cx="33" cy="24" r="2.6" fill="${t.ink}"/>
    ${txt(16, 52, 12, t.face, `> ${i.tag}`, 'start')}
    ${txt(16, 72, 14, '#EDE7DC', `▲ ${i.votes}`, 'start')}
    <rect x="62" y="62" width="8" height="12" fill="${t.face}"/>`,
  file: (t, i) => `
    <path d="M20 6 H62 L82 26 V94 H20 Z" fill="${t.body}" ${S(t)}/>
    <path d="M62 6 V26 H82" fill="${t.face}" ${S(t)}/>
    <rect x="28" y="36" width="34" height="4" rx="2" fill="${t.line}"/><rect x="28" y="46" width="44" height="4" rx="2" fill="${t.line}"/>
    ${txt(51, 68, 14, '#EDE7DC', `▲ ${i.votes}`)}
    <rect x="26" y="76" width="50" height="14" rx="4" fill="${t.face}"/>
    ${txt(51, 87, 10, t.ink, `.${i.tag.toLowerCase()}`)}`,
  database: (t, i) => `
    <path d="M14 22 V78 A36 11 0 0 0 86 78 V22" fill="${t.body}" ${S(t)}/>
    <path d="M14 41 A36 11 0 0 0 86 41 M14 60 A36 11 0 0 0 86 60" fill="none" ${S(t)}/>
    <ellipse cx="50" cy="22" rx="36" ry="11" fill="${t.face}" ${S(t)}/>
    ${txt(50, 56, 11, t.face, i.tag)}
    ${txt(50, 77, 14, '#EDE7DC', `▲ ${i.votes}`)}`,
  chip: (t, i) => `
    <g stroke="${t.line}" stroke-width="4" stroke-linecap="round">
      ${[30, 42, 54, 66].map((p) => `<line x1="${p + 2}" y1="8" x2="${p + 2}" y2="20"/><line x1="${p + 2}" y1="80" x2="${p + 2}" y2="92"/><line x1="8" y1="${p + 2}" x2="20" y2="${p + 2}"/><line x1="80" y1="${p + 2}" x2="92" y2="${p + 2}"/>`).join('')}
    </g>
    <rect x="20" y="20" width="60" height="60" rx="8" fill="${t.body}" ${S(t)}/>
    <rect x="30" y="30" width="40" height="40" rx="4" fill="${t.face}"/>
    ${txt(50, 47, 10, t.ink, i.tag, 'middle', 34)}
    ${txt(50, 63, 13, t.ink, `▲${i.votes}`)}`,
  chat: (t, i) => `
    <path d="M14 14 H86 a8 8 0 0 1 8 8 V64 a8 8 0 0 1 -8 8 H42 L24 88 V72 H14 a8 8 0 0 1 -8 -8 V22 a8 8 0 0 1 8 -8 Z" fill="${t.body}" ${S(t)}/>
    ${txt(50, 38, 11, t.face, i.tag, 'middle', 70)}
    ${txt(50, 60, 15, '#EDE7DC', `▲ ${i.votes}`)}`,
  envelope: (t, i) => `
    <rect x="8" y="22" width="84" height="58" rx="7" fill="${t.body}" ${S(t)}/>
    <path d="M10 25 L50 54 L90 25" fill="none" ${S(t)}/>
    <rect x="64" y="58" width="22" height="18" rx="2" fill="${t.face}"/>
    ${txt(75, 71, 10, t.ink, String(i.votes))}
    ${txt(14, 74, 9, t.face, i.tag, 'start', 44)}`,
  sticky: (t, i) => `
    <path d="M14 12 H86 V68 L68 86 H14 Z" fill="${t.face}" stroke="${t.ink}" stroke-width="3" stroke-linejoin="round" transform="rotate(-4 50 50)"/>
    <path d="M86 68 H68 V86" fill="${t.body}" stroke="${t.ink}" stroke-width="3" stroke-linejoin="round" transform="rotate(-4 50 50)"/>
    <g transform="rotate(-4 50 50)">${txt(24, 36, 11, t.ink, `TODO:`, 'start')}${txt(24, 52, 11, t.ink, i.tag, 'start')}${txt(24, 72, 14, t.ink, `▲ ${i.votes}`, 'start')}</g>`,
  cloud: (t, i) => `
    <path d="M26 80 a18 18 0 0 1 -2 -36 a24 24 0 0 1 46 -8 a20 20 0 0 1 6 44 Z" fill="${t.body}" ${S(t)}/>
    ${txt(50, 56, 11, t.face, i.tag, 'middle', 52)}
    ${txt(50, 72, 13, '#EDE7DC', `▲ ${i.votes}`)}`,
  cartridge: (t, i) => `
    <path d="M18 8 H82 V70 L74 78 V92 H26 V78 L18 70 Z" fill="${t.body}" ${S(t)}/>
    <rect x="27" y="16" width="46" height="40" rx="4" fill="${t.face}"/>
    ${txt(50, 32, 10, t.body, i.tag, 'middle', 40)}
    ${txt(50, 49, 13, '#EDE7DC', `▲${i.votes}`)}
    <g fill="${t.line}"><rect x="32" y="82" width="5" height="10"/><rect x="42" y="82" width="5" height="10"/><rect x="52" y="82" width="5" height="10"/><rect x="62" y="82" width="5" height="10"/></g>`,
  floppy: (t, i) => `
    <path d="M10 10 H78 L90 22 V90 H10 Z" fill="${t.body}" ${S(t)}/>
    <rect x="28" y="12" width="40" height="22" rx="2" fill="${t.face}"/><rect x="54" y="16" width="8" height="14" fill="${t.body}"/>
    <rect x="20" y="46" width="60" height="38" rx="3" fill="#EDE7DC"/>
    ${txt(50, 61, 10, t.ink, i.tag)}
    ${txt(50, 77, 13, t.ink, `▲ ${i.votes}`)}`,
  ticket: (t, i) => `
    <path d="M6 26 H94 V42 a8 8 0 0 0 0 16 V74 H6 V58 a8 8 0 0 0 0 -16 Z" fill="${t.body}" ${S(t)}/>
    <line x1="70" y1="28" x2="70" y2="72" stroke="${t.line}" stroke-width="2.5" stroke-dasharray="4 4"/>
    ${txt(38, 46, 10, t.face, i.tag, 'middle', 54)}
    ${txt(38, 63, 14, t.face, `▲ ${i.votes}`)}
    ${txt(82, 54, 9, t.face, 'ADMIT', 'middle')}`,
  badge: (t, i) => `
    <path d="M40 2 L50 18 L60 2" fill="none" stroke="${t.line}" stroke-width="4"/>
    <rect x="18" y="16" width="64" height="80" rx="9" fill="${t.body}" ${S(t)}/>
    <rect x="40" y="22" width="20" height="5" rx="2.5" fill="${t.ink}"/>
    <circle cx="50" cy="46" r="12" fill="${t.face}" ${S(t)}/>
    <path d="M32 72 a18 14 0 0 1 36 0" fill="${t.face}" ${S(t)}/>
    ${txt(50, 89, 11, t.ink, `GUEST ▲${i.votes}`)}`,
  vcard: (t, i) => `
    <rect x="6" y="22" width="88" height="58" rx="8" fill="${t.body}" ${S(t)}/>
    <circle cx="28" cy="44" r="10" fill="${t.face}" ${S(t)}/>
    <path d="M14 70 a14 11 0 0 1 28 0" fill="${t.face}" ${S(t)}/>
    ${txt(50, 44, 9, t.ink, i.tag, 'start', 38)}
    <rect x="50" y="52" width="34" height="4" rx="2" fill="${t.ink}"/>
    ${txt(50, 72, 13, t.ink, `▲ ${i.votes}`, 'start')}`,
};

const SETS: Record<string, string[]> = {
  bugs: ['terminal', 'file', 'database', 'chip'],
  rebels: ['chat', 'envelope', 'sticky', 'cloud'],
  lunapark: ['cartridge', 'floppy', 'ticket'],
  person: ['badge', 'vcard'],
};

/** Short tag for the object, from the category or the title. */
export function radarTag(category: string | null, title: string) {
  const src = category && category !== 'People' ? category : title;
  const words = src.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
  const word = words.find((w) => !/^(a|an|the|who|that|someone|people)$/i.test(w)) ?? words[0] ?? '';
  return word.slice(0, 8).toUpperCase() || 'TOPIC';
}

export function radarObjectSVG(
  t: { kind: 'topic' | 'person'; pillar: 'bugs' | 'rebels' | 'lunapark'; votes: number; category: string | null; title: string },
  seed: number,
) {
  const group = t.kind === 'person' ? 'person' : t.pillar;
  const set = SETS[group];
  const shape = set[seed % set.length];
  const svg = SHAPES[shape](THEMES[group], { votes: t.votes, tag: radarTag(t.category, t.title) });
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${svg}</svg>`;
}
