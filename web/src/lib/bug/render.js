/**
 * techRebels Bug renderer (v1)
 * Source of truth for how a Rebel Bug is drawn. Ported from Bug Lab.
 * Pure functions, no DOM. bugSVG(config, widthPx) returns an SVG string.
 *
 * Config fields (all optional except shape/shell):
 *   role, species (index into SPECIES), shape, pose, attitude, shell, pattern,
 *   accent, eyes, eyewear, mouth, antennae, hat, extra
 * The lab only builds v1 bugs: shapes round | tall | wide.
 * The 'upright' / 'suit' shapes and face/hair fields are an unapproved v2: do not expose them in the UI.
 */
const INK = '#2A1416';
const COL = { pink:'#F4A5D4', green:'#114F40', lime:'#CDDC27', purple:'#342450', mint:'#3DDB9A', white:'#FFFFFF', brown:'#8C5A3C' };
const ACCENT_FOR = { pink:'mint', green:'pink', lime:'pink', purple:'mint', white:'pink', mint:'pink', brown:'pink' };
const PAT_FOR = { pink:INK, green:COL.pink, lime:INK, purple:COL.mint, white:INK, mint:INK, brown:COL.pink };
const DARK_BG = ['green', 'purple', 'brown'];
const SHAPES = {
  round:{cy:206,rx:80,ry:74}, tall:{cy:212,rx:66,ry:86}, wide:{cy:214,rx:96,ry:62},
  upright:{kind:'up', cy:200, rx:60, ry:64, hy:104, vb:[-40,360]},
  suit:{kind:'suit', cy:232, rx:52, ry:58, hy:124, vb:[-40,360]}
};
const FACES = { ink:INK, s1:'#F7D9C4', s2:'#EDBB95', s3:'#C98D63', s4:'#8E5B3C', s5:'#5C3A27' };
const HAIRC = { dark:'#3B2622', ginger:'#D97A35', blonde:'#F1CF6E', pink:COL.pink, mint:COL.mint, lime:COL.lime };
const ROLES = [
  ['dev','Dev'],['ai','AI'],['data','Data'],['design','Design'],['product','Product'],['marketing','Marketing'],
  ['sales','Sales'],['people','People & HR'],['founder','Founder'],['security','Security'],['ops','Ops & IT'],['curious','Just curious']
];
// [species, quip, role]. Dev entries stay first so bugs saved earlier keep their species.
const SPECIES = [
  ['Heisenbug', 'Disappears the moment you look at it.', 'dev'],
  ['Off-by-one', 'Always shows up one too many. Or one too few.', 'dev'],
  ['Race condition', 'Arrives first. Sometimes second. Never sure.', 'dev'],
  ['Memory leak', 'Remembers everything. Forgets to go home.', 'dev'],
  ['Merge conflict', 'Has strong opinions about your branch.', 'dev'],
  ['404', 'Not found. Never was.', 'dev'],
  ['Undocumented feature', 'Was never a bug. You just skipped the docs.', 'dev'],
  ['Null pointer', 'Points at nothing with total confidence.', 'dev'],
  ['Infinite loop', 'Will talk to you at the bar. Forever.', 'dev'],
  ['Works on my machine', 'Fine at home. Chaos in production.', 'dev'],
  ['Hallucination', 'Makes things up. With citations.', 'ai'],
  ['Prompt injection', 'Ignore all previous instructions. Have fun.', 'ai'],
  ['Overfit', 'Perfect on the training data. Lost at the party.', 'ai'],
  ['Token burner', 'Thinks out loud. Very, very loud.', 'ai'],
  ['Outlier', "Doesn't fit your model. Doesn't want to.", 'data'],
  ['Dirty data', 'Knows fifty spellings of the same city.', 'data'],
  ['Pixel pusher', 'Moves it one pixel left. Then back.', 'design'],
  ['Kerning crime', 'Leaves gaps where nobody expects them.', 'design'],
  ['Scope creep', 'Just one more tiny feature.', 'product'],
  ['Roadmap drift', 'Q1 was a vibe. Q2 is a different vibe.', 'product'],
  ['Viral loop', 'Shares itself. Repeatedly.', 'marketing'],
  ['Clickbait', "You won't believe what this bug does next.", 'marketing'],
  ['Buzzword overflow', 'Synergizes the paradigm. Daily.', 'marketing'],
  ['Pipeline leak', 'Promised Q3. Delivered vibes.', 'sales'],
  ['Ghosted lead', 'Opened your email 14 times. Never replied.', 'sales'],
  ['Always be closing', 'Will close your laptop too.', 'sales'],
  ['Culture bug', 'Brings snacks. Fixes morale.', 'people'],
  ['Onboarding loop', 'Day one, every day.', 'people'],
  ['Pivot', 'Was a fintech yesterday.', 'founder'],
  ['Burn rate', 'Lights money on fire. Calls it growth.', 'founder'],
  ['Zero-day', 'Nobody knew. Until now.', 'security'],
  ['Phish', 'Please confirm your password. Just kidding.', 'security'],
  ['Pager storm', 'Wakes you up at 3:07. Every night.', 'ops'],
  ['Have you tried turning it off', 'And on again. And off again.', 'ops'],
  ['Feature request', 'Not in tech. Has opinions anyway.', 'curious'],
  ['Tourist', 'Came for the beer. Stayed for the bugs.', 'curious']
];
const sp = name => SPECIES.findIndex(x => x[0] === name);
const SEVERITY = ['Cute', 'Chaotic', 'Critical', 'Legendary', 'Mildly cursed', 'Unpatchable'];
const ACCENTS = { auto:null, pink:COL.pink, mint:COL.mint, lime:COL.lime, white:COL.white, brown:COL.brown, purple:COL.purple };
const OPTS = {
  role:     { label:'Role', items:ROLES },
  shape:    { label:'Body', items:[['round','Round'],['tall','Tall'],['wide','Wide']] },
  pose:     { label:'Pose', items:[['stand','Stand'],['wave','Wave'],['hype','Hype'],['stomp','Stomp'],['jump','Jump'],['lean','Lean back']] },
  attitude: { label:'Attitude', items:[['none','Neutral'],['rebel','Rebel'],['smug','Smug'],['excited','Excited'],['worried','Worried']] },
  shell:    { label:'Shell color', swatch:true, items:[['pink','Pink'],['green','Green'],['lime','Lime'],['purple','Purple'],['mint','Mint'],['brown','Brown'],['white','White']] },
  pattern:  { label:'Shell pattern', items:[['code','</>'],['dots','Dots'],['pixels','Pixels'],['circuit','Circuit'],['stripes','Stripes'],['plain','Plain']] },
  accent:   { label:'Accent (antennae, shoes, hats)', swatch:true, colors:ACCENTS, items:[['auto','Auto'],['pink','Pink'],['mint','Mint'],['lime','Lime'],['white','White'],['brown','Brown'],['purple','Purple']] },
  eyes:     { label:'Eyes', items:[['visor','Visor'],['googly','Googly'],['sleepy','Sleepy'],['glitch','Glitched'],['hearts','Hearts'],['pixel','Pixel']] },
  eyewear:  { label:'Eyewear', items:[['none','None'],['glasses','Glasses'],['shades','Shades'],['heartshades','Heart shades'],['monocle','Monocle']] },
  mouth:    { label:'Mouth', items:[['smile','Smile'],['tongue','Tongue'],['grin','Grin'],['o','Oh!'],['smirk','Smirk'],['zigzag','Zigzag'],['fangs','Fangs'],['mustache','Mustache']] },
  antennae: { label:'Antennae', items:[['classic','Classic'],['plug','Plugs'],['cursor','Cursors'],['match','Matches'],['wifi','Wi-Fi']] },
  hat:      { label:'Headgear', items:[['none','None'],['headphones','Headphones'],['headset','Headset'],['beanie','Beanie'],['cap','Cap'],['beret','Beret'],['party','Party hat'],['crown','Crown'],['bandana','Bandana']] },
  extra:    { label:'Extra', items:[['none','None'],['freckles','Freckles'],['earring','Earring'],['bandaid','Band-aid'],['sweat','Deadline sweat'],['sparkles','Sparkles']] },
  bg:       { label:'Card background', swatch:true, items:[['green','Green'],['pink','Pink'],['lime','Lime'],['purple','Purple'],['mint','Mint'],['brown','Brown'],['white','White']] },
  bgpattern:{ label:'Background pattern', items:[['plain','Plain'],['grid','Grid'],['dots','Dots'],['checker','Checker'],['stripes','Stripes'],['code','Code'],['sparkles','Sparkles'],['bugs','Bugs'],['sunburst','Sunburst']] }
};
const DEFAULT = { name:'Glitch', species:0, role:'dev', shape:'round', shell:'pink', pattern:'code', accent:'auto', eyes:'visor', eyewear:'none', mouth:'grin', antennae:'plug', hat:'none', extra:'none', face:'ink', hair:'none', hairc:'pink', bg:'green', bgpattern:'plain', pose:'stand', attitude:'none' };

let uid = 0;
const f = n => +n.toFixed(1);

function vbOf(c) { return (SHAPES[c.shape] || SHAPES.round).vb || [-12, 332]; }

function bugSVG(c, size) {
  const s = SHAPES[c.shape] || SHAPES.round, cx = 150, cy = s.cy, rx = s.rx, ry = s.ry;
  const kind = s.kind || 'classic';
  const hy = s.hy || (cy - ry + 4);
  const shell = COL[c.shell], acc = ACCENTS[c.accent] || COL[ACCENT_FOR[c.shell]], pat = PAT_FOR[c.shell];
  const holds = kind === 'classic' && c.role && c.role !== 'curious';
  const pose = kind === 'classic' ? (c.pose || 'stand') : 'stand';
  const fists = [], dust = [];
  let hold = null;
  const face = FACES[c.face] ? c.face : 'ink', skin = face !== 'ink';
  const faceCol = FACES[face];
  const fc = (face === 'ink' || face === 's4' || face === 's5') ? '#fff' : INK; // feature color on the face
  const handCol = skin ? faceCol : acc;
  const hairCol = HAIRC[c.hairc] || HAIRC.pink;
  const hairStyle = c.hair || 'none';
  const id = 'b' + (++uid);
  let o = '';

  const limb = d => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  const hand = (x, y, r) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r || 10}" fill="${handCol}" stroke="${INK}" stroke-width="4"/>`;
  const shoe = (x, y, a, b) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${a || 11}" ry="${b || 7}" fill="${acc}" stroke="${INK}" stroke-width="4"/>`;
  const outline = kind === 'suit'
    ? `<path d="M98 302 C96 228 112 186 150 184 C188 186 204 228 202 302 Z"/>`
    : `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
  const shellBlock = () =>
    `<clipPath id="${id}">${outline}</clipPath>` +
    outline.replace('/>', ` fill="${shell}"/>`) +
    `<g clip-path="url(#${id})">${pattern(c.pattern, cx, cy, rx, ry, pat, shell)}` +
    `<path d="M${f(cx - rx * 0.66)} ${f(cy - ry * 0.05)} Q${f(cx - rx * 0.6)} ${f(cy - ry * 0.6)} ${f(cx - rx * 0.22)} ${f(cy - ry * 0.8)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/></g>` +
    outline.replace('/>', ` fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`);

  if (kind === 'classic') {
    // six legs + sneakers (behind the shell)
    [-0.35, 0.15, 0.6].forEach((t, i) => {
      [-1, 1].forEach(d => {
        const y = cy + t * ry, x = cx + d * rx * Math.sqrt(1 - t * t) * 0.82;
        let kx = x + d * 30, ky = y - 12 + i * 4, fx = x + d * 44, fy = y + 18 + i * 8;
        const up = i === 0 && (pose === 'hype' || (pose === 'wave' && d === 1));
        if (up) { ky = y - 24; fx = x + d * 40; fy = y - 58; fists.push([fx, fy, d]); }
        else if (pose === 'jump') { kx = x + d * 20; ky = y + 12; fx = x + d * 24; fy = y + 32 + i * 6; }
        else if (pose === 'stomp') { kx = x + d * 36; ky = y - 8 + i * 4; fx = x + d * 54; fy = y + 22 + i * 8; if (i === 2) dust.push([fx, fy + 10, d]); }
        const grabs = holds && i === 0 && d === 1;
        if (grabs) hold = [f(Math.min(fx + 4, 256)), f(fy - 4)];
        o += limb(`M${f(x)} ${f(y)} L${f(kx)} ${f(ky)} L${f(fx)} ${f(fy)}`) + (grabs ? '' : up ? `<circle cx="${f(fx)}" cy="${f(fy)}" r="9" fill="${acc}" stroke="${INK}" stroke-width="4"/>` : shoe(fx + d * 4, fy + 3));
      });
    });
    o += shellBlock();
    o += `<path d="M${cx} ${cy - ry + 6} L${cx} ${cy + ry - 2}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    if (c.extra === 'bandaid') o += bandaid(cx - rx * 0.42, cy + ry * 0.42);
  } else if (kind === 'up') {
    // stands on two legs, waves with four arms
    [-1, 1].forEach(d => {
      o += limb(`M${150 + d * 14} 258 L${150 + d * 18} 298`) + shoe(150 + d * 24, 304, 16, 9);
      o += limb(`M${150 + d * 50} 172 L${150 + d * 80} 152 L${150 + d * 90} 122`) + hand(150 + d * 91, 114);
      o += limb(`M${150 + d * 56} 214 L${150 + d * 84} 226 L${150 + d * 82} 250`) + hand(150 + d * 82, 255, 9);
    });
    o += shellBlock();
    o += `<path d="M${cx} ${cy - ry + 10} L${cx} ${cy + ry - 2}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
  } else {
    // a human in a bug hoodie
    o += shoe(126, 306, 17, 10) + shoe(174, 306, 17, 10);
    o += dbl(`M114 204 Q94 228 92 256`, 18, shell) + hand(91, 265, 11);
    o += dbl(`M188 206 Q224 190 232 160`, 18, shell) + hand(233, 151, 11);
    o += shellBlock();
    o += `<path d="M120 262 H180 L188 292 H112 Z" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" opacity=".6"/>`;
    o += `<path d="M150 186 L150 262" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><rect x="145" y="200" width="10" height="16" rx="3" fill="${acc}" stroke="${INK}" stroke-width="3"/>`;
  }

  // antennae (behind head / hood)
  o += antennae(c.antennae, kind === 'suit' ? 98 : hy, acc);

  if (kind === 'suit') {
    o += `<circle cx="150" cy="118" r="64" fill="${shell}" stroke="${INK}" stroke-width="7"/>`;
    o += `<path d="M98 100 Q106 72 134 60" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="7" stroke-linecap="round"/>`;
    o += `<circle cx="150" cy="${hy}" r="49" fill="${INK}" opacity=".35"/>`;
  }

  // head + face
  const hr = kind === 'suit' ? 42 : 44;
  o += hairBack(hairStyle, hy, hairCol);
  o += `<circle cx="${cx}" cy="${hy}" r="${hr}" fill="${faceCol}"${skin || kind === 'suit' ? ` stroke="${INK}" stroke-width="5"` : ''}/>`;
  o += `<circle cx="121" cy="${hy + 16}" r="6" fill="${COL.pink}" opacity="${skin ? '.8' : '.55'}"/><circle cx="179" cy="${hy + 16}" r="6" fill="${COL.pink}" opacity="${skin ? '.8' : '.55'}"/>`;
  o += hairFront(hairStyle, hy, hairCol);
  o += extraFace(c.extra, hy);
  o += eyes(c.eyes, hy, acc, skin, fc);
  o += eyewear(c.eyewear, hy, acc);
  o += mouth(c.mouth || legacyMouth(c.eyes), hy, skin, fc, acc);
  o += brows(c.attitude, hy, fc);
  if (kind !== 'suit') o += hat(c.hat, hy, acc);
  if (hold) o += prop(c.role, hold[0], hold[1]);
  fists.forEach(([x, y, d]) => o += `<path d="M${f(x + d * 16)} ${f(y - 12)} l${d * 9} -6 M${f(x + d * 18)} ${f(y + 2)} l${d * 10} 0 M${f(x + d * 2)} ${f(y - 18)} l${d * 3} -9" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`);
  dust.forEach(([x, y, d]) => o += `<g fill="#fff" fill-opacity=".75" stroke="${INK}" stroke-width="2.5"><circle cx="${f(x + d * 10)}" cy="${f(y)}" r="7"/><circle cx="${f(x + d * 20)}" cy="${f(y - 4)}" r="5"/></g>`);
  const tf = { stomp:'rotate(-6 150 230)', lean:'rotate(10 150 230)', jump:'translate(0 -16)', hype:'translate(0 -6)' }[pose];
  if (tf) o = `<g transform="${tf}">${o}</g>`;
  if (pose === 'jump') o = `<ellipse cx="150" cy="306" rx="70" ry="7" fill="${INK}" opacity=".22"/>` + o;

  const w = size || 300, vb = vbOf(c);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${vb[0]} 300 ${vb[1]}" width="${w}" height="${f(w * vb[1] / 300)}" role="img" aria-label="Rebel bug mascot">${o}</svg>`;
}

function hairBack(h, hy, col) {
  if (h !== 'long') return '';
  return `<path d="M104 ${hy - 4} C97 ${hy + 30} 100 ${hy + 52} 110 ${hy + 60} L190 ${hy + 60} C200 ${hy + 52} 203 ${hy + 30} 196 ${hy - 4} Z" fill="${col}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
}

function hairFront(h, hy, col) {
  const st = ` stroke="${INK}" stroke-width="4" stroke-linejoin="round"`;
  const cap = s => `<path d="M106.7 ${hy - 8} A44 44 0 0 1 193.3 ${hy - 8} Q150 ${hy - 30} 106.7 ${hy - 8} Z" fill="${col}"${s}/>`;
  switch (h) {
    case 'fringe':
      return `<path d="M106.7 ${hy - 8} A44 44 0 0 1 193.3 ${hy - 8} Q186 ${hy - 20} 176 ${hy - 13} Q166 ${hy - 27} 154 ${hy - 15} Q142 ${hy - 28} 130 ${hy - 14} Q118 ${hy - 24} 106.7 ${hy - 8} Z" fill="${col}"${st}/>`;
    case 'bun':
      return `<circle cx="150" cy="${hy - 50}" r="15" fill="${col}"${st}/>` + cap(st);
    case 'curls': {
      let o = '';
      for (let a = 195; a <= 345; a += 25) { const r = a * Math.PI / 180; o += `<circle cx="${f(150 + 40 * Math.cos(r))}" cy="${f(hy + 40 * Math.sin(r))}" r="12" fill="${col}"${st}/>`; }
      return o + cap('');
    }
    case 'mohawk':
      return `<path d="M130 ${hy - 38} L134 ${hy - 66} L144 ${hy - 44} L150 ${hy - 76} L156 ${hy - 44} L166 ${hy - 66} L170 ${hy - 38} Z" fill="${col}"${st}/>`;
    case 'long':
      return cap(st);
  }
  return '';
}

function pattern(p, cx, cy, rx, ry, col, shell) {
  let o = '';
  if (p === 'dots') {
    [[-.5,-.2,.17],[-.3,.38,.13],[-.66,.32,.09],[.48,-.12,.15],[.34,.46,.12],[.68,.26,.08],[-.22,-.55,.08],[.2,-.5,.1]]
      .forEach(([a, b, r]) => o += `<circle cx="${f(cx + a * rx)}" cy="${f(cy + b * ry)}" r="${f(r * rx)}" fill="${col}"/>`);
  } else if (p === 'code') {
    const lx = cx - rx * 0.45, rxx = cx + rx * 0.45, y = cy + ry * 0.12, k = Math.min(rx, ry) * 0.24;
    o += `<path d="M${f(lx + k * .6)} ${f(y - k)} L${f(lx - k * .6)} ${f(y)} L${f(lx + k * .6)} ${f(y + k)}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    o += `<path d="M${f(rxx - k * .6)} ${f(y - k)} L${f(rxx + k * .6)} ${f(y)} L${f(rxx - k * .6)} ${f(y + k)}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (p === 'pixels') {
    const sz = rx * 0.15;
    for (let gx = -4; gx <= 4; gx++) for (let gy = -3; gy <= 3; gy++) {
      if (gx === 0) continue;
      if (((gx * 7 + gy * 13 + 41) % 4) !== 0) continue;
      o += `<rect x="${f(cx + gx * rx * 0.21 - sz / 2)}" y="${f(cy + gy * ry * 0.26 - sz / 2)}" width="${f(sz)}" height="${f(sz)}" fill="${col}"/>`;
    }
  } else if (p === 'stripes') {
    for (let k = 0; k < 8; k++) o += `<rect x="${cx - rx}" y="${f(cy - ry + k * ry * 0.3 + ry * 0.1)}" width="${rx * 2}" height="${f(ry * 0.12)}" fill="${col}"/>`;
  } else if (p === 'circuit') {
    [-1, 1].forEach(d => {
      const ends = [];
      let x1 = cx + d * rx * .35, y1 = cy - ry * .05;
      o += `<path d="M${cx} ${f(cy - ry * .3)} H${f(x1)} V${f(y1)}" fill="none" stroke="${col}" stroke-width="5" stroke-linejoin="round"/>`; ends.push([x1, y1]);
      let x2 = cx + d * rx * .6, y2 = cy + ry * .2;
      o += `<path d="M${cx} ${f(y2)} H${f(x2)}" fill="none" stroke="${col}" stroke-width="5"/>`; ends.push([x2, y2]);
      let x3 = cx + d * rx * .42, y3 = cy + ry * .68;
      o += `<path d="M${cx} ${f(cy + ry * .48)} H${f(cx + d * rx * .2)} V${f(y3)} H${f(x3)}" fill="none" stroke="${col}" stroke-width="5" stroke-linejoin="round"/>`; ends.push([x3, y3]);
      ends.forEach(([x, y]) => o += `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${shell}" stroke="${col}" stroke-width="5"/>`);
    });
  }
  return o;
}

function dbl(d, w, color) { // ink outline + colored core, so thin parts read on any background
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function antennae(a, hy, acc) {
  let o = '';
  if (a === 'wifi') {
    o += dbl(`M150 ${hy - 40} L150 ${hy - 70}`, 5, acc);
    o += `<circle cx="150" cy="${hy - 74}" r="8" fill="${acc}" stroke="${INK}" stroke-width="4"/>`;
    [17, 30].forEach(r => o += dbl(`M${f(150 - r * .7)} ${f(hy - 78 - r * .7)} A${r} ${r} 0 0 1 ${f(150 + r * .7)} ${f(hy - 78 - r * .7)}`, 5, acc));
    return o;
  }
  [-1, 1].forEach(d => {
    const X = dx => f(150 + d * dx);
    if (a === 'classic') {
      o += `<path d="M${X(18)} ${hy - 38} Q${X(34)} ${hy - 66} ${X(46)} ${hy - 86}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
      o += `<circle cx="${X(46)}" cy="${hy - 90}" r="10" fill="${acc}" stroke="${INK}" stroke-width="5"/>`;
    } else if (a === 'plug') {
      o += `<path d="M${X(18)} ${hy - 38} C${X(30)} ${hy - 62} ${X(58)} ${hy - 58} ${X(50)} ${hy - 84}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
      o += `<path d="M${X(46)} ${hy - 101} L${X(46)} ${hy - 112} M${X(54)} ${hy - 101} L${X(54)} ${hy - 112}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
      o += `<rect x="${f(150 + d * 50 - 11)}" y="${hy - 102}" width="22" height="20" rx="5" fill="${acc}" stroke="${INK}" stroke-width="4"/>`;
    } else if (a === 'cursor') {
      o += `<path d="M${X(18)} ${hy - 38} L${X(40)} ${hy - 80}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
      const tx = 150 + d * 50, ty = hy - 108;
      const pts = [[0,0],[0,28],[7,21],[12,32],[18,30],[13,19],[22,19]].map(([px, py]) => `${f(tx - d * px)},${ty + py}`).join(' ');
      o += `<polygon points="${pts}" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
    } else if (a === 'match') {
      const bx = 150 + d * 16, by = hy - 38, tx = 150 + d * 34, ty = hy - 80;
      o += dbl(`M${f(bx)} ${by} L${f(tx)} ${ty}`, 7, '#E8C38E');
      o += `<ellipse cx="${f(tx + d * 1)}" cy="${ty - 6}" rx="9" ry="11" fill="${COL.pink}" stroke="${INK}" stroke-width="4"/>`;
      const fx = tx + d * 2, fy = ty - 15;
      o += `<path d="M${f(fx)} ${fy} C${f(fx - 17)} ${fy - 6} ${f(fx - 12)} ${fy - 26} ${f(fx)} ${fy - 42} C${f(fx + 12)} ${fy - 26} ${f(fx + 17)} ${fy - 6} ${f(fx)} ${fy}Z" fill="${COL.lime}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
      o += `<path d="M${f(fx)} ${fy - 4} C${f(fx - 8)} ${fy - 7} ${f(fx - 6)} ${fy - 16} ${f(fx)} ${fy - 23} C${f(fx + 6)} ${fy - 16} ${f(fx + 8)} ${fy - 7} ${f(fx)} ${fy - 4}Z" fill="#fff"/>`;
    }
  });
  return o;
}

function heart(x, y, col) {
  return `<path d="M${x} ${y + 8} C${x - 16} ${y - 2} ${x - 10} ${y - 16} ${x} ${y - 7} C${x + 10} ${y - 16} ${x + 16} ${y - 2} ${x} ${y + 8}Z" fill="${col}"/>`;
}

function eyes(e, hy, acc, skin, fc) {
  const y = hy - 4;
  const ws = skin ? ` stroke="${INK}" stroke-width="3"` : '';
  switch (e) {
    case 'visor':
      return `<rect x="106" y="${hy - 20}" width="88" height="30" rx="15" fill="${acc}"${ws}/>` +
        `<path d="M118 ${hy - 11} L132 ${hy - 11}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>` +
        `<path d="M138 ${hy - 11} L142 ${hy - 11}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>`;
    case 'googly':
      return `<circle cx="132" cy="${y}" r="15" fill="#fff"${ws}/><circle cx="168" cy="${y}" r="15" fill="#fff"${ws}/>` +
        `<circle cx="136" cy="${y + 3}" r="7" fill="${INK}"/><circle cx="164" cy="${y - 2}" r="7" fill="${INK}"/>` +
        `<circle cx="138" cy="${y + 1}" r="2" fill="#fff"/><circle cx="166" cy="${y - 4}" r="2" fill="#fff"/>`;
    case 'sleepy':
      return `<path d="M119 ${y - 2} a13 10 0 0 0 26 0 z" fill="#fff"${ws}/><path d="M155 ${y - 2} a13 10 0 0 0 26 0 z" fill="#fff"${ws}/>` +
        `<path d="M116 ${y - 3} H148 M152 ${y - 3} H184" stroke="${COL.pink}" stroke-width="5" stroke-linecap="round"/>` +
        `<circle cx="134" cy="${y + 3}" r="4" fill="${INK}"/><circle cx="170" cy="${y + 3}" r="4" fill="${INK}"/>`;
    case 'glitch':
      return `<path d="M124 ${y - 9} L140 ${y + 7} M140 ${y - 9} L124 ${y + 7} M160 ${y - 9} L176 ${y + 7} M176 ${y - 9} L160 ${y + 7}" stroke="${fc}" stroke-width="6" stroke-linecap="round"/>` +
        `<rect x="112" y="${y - 2}" width="10" height="4" fill="${acc}"/><rect x="178" y="${y + 4}" width="12" height="4" fill="${acc}"/>`;
    case 'hearts':
      return heart(132, y, COL.pink) + heart(168, y, COL.pink);
    case 'pixel':
      return `<rect x="124" y="${y - 9}" width="17" height="17" fill="#fff"${ws}/><rect x="159" y="${y - 9}" width="17" height="17" fill="#fff"${ws}/>` +
        `<rect x="132" y="${y - 3}" width="8" height="8" fill="${INK}"/><rect x="167" y="${y - 3}" width="8" height="8" fill="${INK}"/>`;
  }
  return '';
}

function legacyMouth(e) { return e === 'visor' ? 'grin' : e === 'glitch' ? 'zigzag' : e === 'sleepy' ? 'o' : 'tongue'; }

function mouth(m, hy, skin, fc, acc) {
  const ws = skin ? ` stroke="${INK}" stroke-width="3" stroke-linejoin="round"` : '';
  const smile = `<path d="M139 ${hy + 19} Q150 ${hy + 29} 161 ${hy + 19}" fill="none" stroke="${fc}" stroke-width="4" stroke-linecap="round"/>`;
  switch (m) {
    case 'grin':
      return `<path d="M135 ${hy + 17} Q150 ${hy + 35} 165 ${hy + 17} Z" fill="#fff"${ws}/><path d="M146 ${hy + 17} L146 ${hy + 24} M154 ${hy + 17} L154 ${hy + 24}" stroke="${INK}" stroke-width="2.5"/>`;
    case 'zigzag':
      return `<path d="M136 ${hy + 24} l7 -6 l7 6 l7 -6 l7 6" fill="none" stroke="${fc}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'o':
      return `<ellipse cx="150" cy="${hy + 24}" rx="6" ry="7" fill="${fc}"/>`;
    case 'smile':
      return smile;
    case 'smirk':
      return `<path d="M140 ${hy + 23} Q152 ${hy + 27} 162 ${hy + 16}" fill="none" stroke="${fc}" stroke-width="4" stroke-linecap="round"/>`;
    case 'fangs':
      return smile + `<path d="M142 ${hy + 22} L145 ${hy + 31} L148 ${hy + 24} Z M152 ${hy + 24} L155 ${hy + 31} L158 ${hy + 22} Z" fill="#fff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
    case 'mustache':
      return `<path d="M143 ${hy + 27} Q150 ${hy + 31} 157 ${hy + 27}" fill="none" stroke="${fc}" stroke-width="3.5" stroke-linecap="round"/>` +
        `<path d="M150 ${hy + 15} C142 ${hy + 9} 129 ${hy + 12} 126 ${hy + 21} C135 ${hy + 19} 143 ${hy + 22} 150 ${hy + 18} C157 ${hy + 22} 165 ${hy + 19} 174 ${hy + 21} C171 ${hy + 12} 158 ${hy + 9} 150 ${hy + 15} Z" fill="${acc}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  return smile + `<path d="M153 ${hy + 25} q3 8 8 2" fill="${COL.pink}"/>`;
}

function brows(a, hy, fc) {
  const b = d => `<path d="${d}" fill="none" stroke="${fc}" stroke-width="6" stroke-linecap="round"/>`;
  switch (a) {
    case 'rebel': return b(`M118 ${hy - 30} L143 ${hy - 20} M182 ${hy - 30} L157 ${hy - 20}`);
    case 'smug': return b(`M120 ${hy - 24} L143 ${hy - 24} M157 ${hy - 26} Q170 ${hy - 38} 182 ${hy - 29}`);
    case 'excited': return b(`M120 ${hy - 26} Q131 ${hy - 36} 142 ${hy - 27} M158 ${hy - 27} Q169 ${hy - 36} 180 ${hy - 26}`);
    case 'worried': return b(`M120 ${hy - 22} L142 ${hy - 31} M180 ${hy - 22} L158 ${hy - 31}`);
  }
  return '';
}

function star4(x, y, r, col) {
  return `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="${col}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
}

function bigHeart(x, y, col, sw) {
  return `<path d="M${x} ${y + 12} C${x - 24} ${y - 2} ${x - 14} ${y - 22} ${x} ${y - 9} C${x + 14} ${y - 22} ${x + 24} ${y - 2} ${x} ${y + 12} Z" fill="${col}" stroke="${INK}" stroke-width="${sw || 3}" stroke-linejoin="round"/>`;
}

function eyewear(w, hy, acc) {
  const y = hy - 4;
  switch (w) {
    case 'glasses':
      return `<g fill="none" stroke="${acc}" stroke-width="4"><circle cx="132" cy="${y}" r="16"/><circle cx="168" cy="${y}" r="16"/><path d="M148 ${y} L152 ${y} M116 ${y - 2} L106 ${y - 6} M184 ${y - 2} L194 ${y - 6}" stroke-linecap="round"/></g>`;
    case 'shades':
      return `<rect x="113" y="${y - 12}" width="35" height="22" rx="9" fill="#120A0B" stroke="${acc}" stroke-width="3"/><rect x="152" y="${y - 12}" width="35" height="22" rx="9" fill="#120A0B" stroke="${acc}" stroke-width="3"/>` +
        `<path d="M148 ${y - 4} L152 ${y - 4}" stroke="${acc}" stroke-width="3"/><path d="M119 ${y - 6} L127 ${y - 6} M158 ${y - 6} L166 ${y - 6}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
    case 'heartshades':
      return bigHeart(131, y, COL.pink) + bigHeart(169, y, COL.pink) + `<path d="M146 ${y - 4} L154 ${y - 4}" stroke="${INK}" stroke-width="3"/>`;
    case 'monocle':
      return `<circle cx="168" cy="${y}" r="16" fill="#fff" fill-opacity=".15" stroke="${COL.lime}" stroke-width="4"/><path d="M180 ${y + 11} Q192 ${y + 40} 178 ${y + 52}" fill="none" stroke="${COL.lime}" stroke-width="2.5" stroke-linecap="round"/>`;
  }
  return '';
}

function extraFace(x, hy) {
  switch (x) {
    case 'freckles':
      return [[116, 9], [123, 13], [114, 15], [184, 9], [177, 13], [186, 15]].map(([a, b]) => `<circle cx="${a}" cy="${hy + b}" r="2" fill="${COL.pink}"/>`).join('');
    case 'earring':
      return `<circle cx="107" cy="${hy + 20}" r="7" fill="none" stroke="${COL.lime}" stroke-width="3.5"/><circle cx="107" cy="${hy + 12}" r="3" fill="${COL.lime}"/>`;
    case 'sweat':
      return `<path d="M197 ${hy - 36} C190 ${hy - 25} 188 ${hy - 18} 197 ${hy - 14} C206 ${hy - 18} 204 ${hy - 25} 197 ${hy - 36} Z" fill="#BFF3E0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'sparkles':
      return star4(58, hy + 6, 11, COL.lime) + star4(246, hy - 34, 8, COL.pink) + star4(46, hy + 40, 6, COL.mint);
  }
  return '';
}

function bandaid(x, y) {
  return `<g transform="translate(${f(x)} ${f(y)}) rotate(-28)"><rect x="-19" y="-7" width="38" height="14" rx="7" fill="#F6D7B8" stroke="${INK}" stroke-width="3"/><rect x="-6" y="-7" width="12" height="14" fill="#EBC09A" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="-13" cy="-2" r="1.2" fill="${INK}"/><circle cx="-13" cy="2" r="1.2" fill="${INK}"/><circle cx="13" cy="-2" r="1.2" fill="${INK}"/><circle cx="13" cy="2" r="1.2" fill="${INK}"/></g>`;
}

// Role props, held by the upper right leg.
function prop(role, X, Y) {
  const st = (w) => ` stroke="${INK}" stroke-width="${w || 4}" stroke-linejoin="round"`;
  switch (role) {
    case 'dev':
      return `<rect x="${X - 20}" y="${Y - 24}" width="40" height="28" rx="4" fill="#ECE6E9"${st()}/><rect x="${X - 15}" y="${Y - 19}" width="30" height="18" rx="2" fill="${INK}"/>` +
        `<path d="M${X - 5} ${Y - 14} l-5 4 l5 4 M${X + 5} ${Y - 14} l5 4 l-5 4" fill="none" stroke="${COL.pink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="M${X - 27} ${Y + 4} L${X + 27} ${Y + 4} L${X + 22} ${Y + 11} L${X - 22} ${Y + 11} Z" fill="#ECE6E9"${st()}/>`;
    case 'ai':
      return star4(X, Y, 20, COL.lime) + star4(X + 17, Y - 18, 9, COL.mint) + star4(X - 15, Y + 16, 7, COL.pink);
    case 'data':
      return `<rect x="${X - 21}" y="${Y - 22}" width="42" height="40" rx="6" fill="#fff"${st()}/>` +
        `<rect x="${X - 13}" y="${Y + 1}" width="7" height="10" fill="${COL.mint}"${st(2)}/><rect x="${X - 3.5}" y="${Y - 7}" width="7" height="18" fill="${COL.pink}"${st(2)}/><rect x="${X + 6}" y="${Y - 15}" width="7" height="26" fill="${COL.lime}"${st(2)}/>`;
    case 'design':
      return `<g transform="translate(${X} ${Y}) rotate(35)"><rect x="-6" y="-24" width="12" height="38" fill="${COL.lime}"${st(3)}/><rect x="-6" y="-31" width="12" height="8" rx="2" fill="${COL.pink}"${st(3)}/>` +
        `<path d="M-6 14 L0 27 L6 14 Z" fill="#F6D7B8"${st(3)}/><path d="M-2 22 L0 27 L2 22 Z" fill="${INK}"/></g>`;
    case 'product':
      return `<g transform="translate(${X} ${Y}) rotate(-7)"><path d="M-20 -20 H20 V10 L10 20 H-20 Z" fill="${COL.lime}"${st(3)}/><path d="M10 20 V10 H20" fill="#B9C61F"${st(3)}/>` +
        `<path d="M-12 -8 l4 4 l9 -9" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M-12 5 H6" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/></g>`;
    case 'marketing':
      return `<g transform="translate(${X} ${Y}) rotate(-18)"><path d="M-14 -7 L12 -19 L12 19 L-14 7 Z" fill="${COL.pink}"${st()}/><rect x="-24" y="-8" width="11" height="16" rx="3" fill="#fff"${st()}/>` +
        `<path d="M18 -9 Q25 0 18 9 M23 -16 Q35 0 23 16" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`;
    case 'sales':
      return `<g transform="translate(${X} ${Y}) rotate(10)"><rect x="-13" y="-23" width="26" height="44" rx="6" fill="${INK}" stroke="#fff" stroke-width="2"/><rect x="-9" y="-17" width="18" height="30" rx="2" fill="${COL.mint}"/>` +
        `<path d="M-6 7 L-1 1 L2 4 L6 -6 M2 -6 H6 V-2" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    case 'people':
      return bigHeart(X, Y + 2, COL.pink, 4) + `<path d="M${X - 10} ${Y - 6} Q${X - 9} ${Y - 11} ${X - 4} ${Y - 11}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    case 'founder':
      return `<g transform="translate(${X} ${Y}) rotate(30)"><path d="M-7 6 L-15 19 L-7 16 Z M7 6 L15 19 L7 16 Z" fill="${COL.pink}"${st(3)}/>` +
        `<path d="M-5 17 Q0 33 5 17 Z" fill="${COL.lime}"${st(3)}/><path d="M0 -27 C11 -16 11 8 7 17 L-7 17 C-11 8 -11 -16 0 -27 Z" fill="#fff"${st()}/>` +
        `<circle cx="0" cy="-6" r="5" fill="${COL.mint}"${st(3)}/></g>`;
    case 'security':
      return `<path d="M${X} ${Y - 23} L${X + 19} ${Y - 15} C${X + 19} ${Y + 4} ${X + 11} ${Y + 15} ${X} ${Y + 22} C${X - 11} ${Y + 15} ${X - 19} ${Y + 4} ${X - 19} ${Y - 15} Z" fill="${COL.mint}"${st()}/>` +
        `<path d="M${X - 8} ${Y} L${X - 2} ${Y + 7} L${X + 9} ${Y - 7}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'ops':
      return [0, 45, 90, 135].map(a => `<rect x="${X - 5}" y="${Y - 21}" width="10" height="42" rx="2" transform="rotate(${a} ${X} ${Y})" fill="${COL.lime}"${st(3)}/>`).join('') +
        `<circle cx="${X}" cy="${Y}" r="15" fill="${COL.lime}"/><circle cx="${X}" cy="${Y}" r="6" fill="${INK}"/>`;
  }
  return '';
}

function hat(h, hy, acc) {
  switch (h) {
    case 'headphones':
      return dbl(`M98 ${hy + 2} A52 52 0 0 1 202 ${hy + 2}`, 7, acc) +
        `<rect x="88" y="${hy - 12}" width="20" height="36" rx="9" fill="${acc}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="192" y="${hy - 12}" width="20" height="36" rx="9" fill="${acc}" stroke="${INK}" stroke-width="5"/>`;
    case 'headset':
      return dbl(`M98 ${hy + 2} A52 52 0 0 1 202 ${hy + 2}`, 7, acc) +
        `<path d="M98 ${hy + 16} Q100 ${hy + 40} 128 ${hy + 34}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
        `<rect x="88" y="${hy - 12}" width="20" height="36" rx="9" fill="${acc}" stroke="${INK}" stroke-width="5"/>` +
        `<rect x="192" y="${hy - 12}" width="20" height="36" rx="9" fill="${acc}" stroke="${INK}" stroke-width="5"/>` +
        `<ellipse cx="131" cy="${hy + 33}" rx="7" ry="6" fill="${acc}" stroke="${INK}" stroke-width="4"/>`;
    case 'beanie':
      return `<path d="M107 ${hy - 24} A43 43 0 0 1 193 ${hy - 24} Z" fill="${acc}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M128 ${hy - 56} L128 ${hy - 30} M150 ${hy - 64} L150 ${hy - 30} M172 ${hy - 56} L172 ${hy - 30}" stroke="${INK}" stroke-width="3" opacity=".35"/>` +
        `<rect x="103" y="${hy - 32}" width="94" height="17" rx="8.5" fill="${acc}" stroke="${INK}" stroke-width="5"/>` +
        `<circle cx="150" cy="${hy - 70}" r="10" fill="#fff" stroke="${INK}" stroke-width="5"/>`;
    case 'cap':
      return `<path d="M150 ${hy - 26} Q196 ${hy - 34} 218 ${hy - 20} Q196 ${hy - 14} 150 ${hy - 18} Z" fill="${acc}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>` +
        `<path d="M107 ${hy - 20} A43 43 0 0 1 193 ${hy - 20} Z" fill="${acc}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M150 ${hy - 62} L150 ${hy - 22}" stroke="${INK}" stroke-width="3" opacity=".35"/><circle cx="150" cy="${hy - 63}" r="5" fill="${acc}" stroke="${INK}" stroke-width="3"/>`;
    case 'beret':
      return `<ellipse cx="142" cy="${hy - 38}" rx="44" ry="15" transform="rotate(-12 142 ${hy - 38})" fill="${acc}" stroke="${INK}" stroke-width="5"/>` +
        `<path d="M140 ${hy - 53} L143 ${hy - 62}" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    case 'crown':
      return `<path d="M118 ${hy - 32} L118 ${hy - 64} L134 ${hy - 48} L150 ${hy - 72} L166 ${hy - 48} L182 ${hy - 64} L182 ${hy - 32} Z" fill="${COL.lime}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<circle cx="150" cy="${hy - 44}" r="5" fill="${COL.pink}" stroke="${INK}" stroke-width="2.5"/><circle cx="130" cy="${hy - 40}" r="3.5" fill="${COL.mint}"/><circle cx="170" cy="${hy - 40}" r="3.5" fill="${COL.mint}"/>`;
    case 'party':
      return `<path d="M127 ${hy - 34} L150 ${hy - 96} L173 ${hy - 34} Z" fill="${acc}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M136 ${hy - 58} L162 ${hy - 50} M142 ${hy - 76} L157 ${hy - 70}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
        `<circle cx="150" cy="${hy - 98}" r="7" fill="#fff" stroke="${INK}" stroke-width="4"/>`;
    case 'bandana':
      return `<path d="M107 ${hy - 26} Q150 ${hy - 42} 193 ${hy - 26} L194 ${hy - 15} Q150 ${hy - 30} 106 ${hy - 15} Z" fill="${acc}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>` +
        `<path d="M192 ${hy - 22} L216 ${hy - 36} L212 ${hy - 20} Z M192 ${hy - 20} L218 ${hy - 10} L206 ${hy - 4} Z" fill="${acc}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>` +
        `<circle cx="128" cy="${hy - 27}" r="2.5" fill="#fff"/><circle cx="150" cy="${hy - 31}" r="2.5" fill="#fff"/><circle cx="172" cy="${hy - 27}" r="2.5" fill="#fff"/>`;
  }
  return '';
}


export { INK, COL, ACCENT_FOR, PAT_FOR, DARK_BG, SHAPES, ROLES, SPECIES, SEVERITY, ACCENTS, OPTS, DEFAULT, bugSVG, vbOf };
