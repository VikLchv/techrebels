// External links and placeholders. The team can edit this file directly on GitHub.
export const links = {
  lumaCalendar: '#',
  lumaSession: '#',
  instagram: '#',
  linkedin: '#',
  slackInvite: '#', // members only, never shown on public pages
};

export const session = {
  name: 'Rebel Session #01',
  date: '[date]',
  venue: '[venue]',
  city: 'Prague',
  people: '30 to 50 people',
  length: '90 min',
};

// The crew page. Photo + the member's own bug as a sticker. linkedin: full profile URL ('#' = placeholder).
// bugNumber links a member to their saved bug (founder numbers 0-9): the page shows the live bug from the
// database and falls back to the bug below until it is saved.
// Replace [one line ...] with your own words; swap a bug config once it's built in the Bug Lab.
export const crew = [
  {
    name: 'Any Kožuch', short: 'Any', role: 'Co-founder', photo: '/crew/any.webp', linkedin: '#',
    bugNumber: 1, bugName: '[bug name]', line: '[one line about Any]', tile: 'var(--purple)',
    bug: { role: 'people', shape: 'tall', shell: 'green', pattern: 'dots', eyes: 'googly', mouth: 'smile', antennae: 'match', hat: 'none', pose: 'wave', attitude: 'excited', extra: 'freckles' },
  },
  {
    name: 'Viktorie Láchová', short: 'Vik', role: 'Co-founder', photo: '/crew/vik.webp', linkedin: '#',
    bugNumber: 0, bugName: 'Vik Hopper', line: '[one line about Vik]', tile: 'var(--lime)',
    bug: { role: 'dev', shape: 'round', shell: 'pink', pattern: 'code', accent: 'brown', eyes: 'visor', eyewear: 'none', mouth: 'fangs', antennae: 'plug', hat: 'none', extra: 'none', pose: 'stand', attitude: 'smug' },
  },
  {
    name: 'Tom Kos', short: 'Tom', role: '[role]', photo: '/crew/tom.webp', linkedin: '#',
    bugNumber: 2, bugName: '[bug name]', line: '[one line about Tom]', tile: 'var(--mint)',
    bug: { role: 'design', shape: 'wide', shell: 'lime', pattern: 'pixels', eyes: 'visor', eyewear: 'shades', mouth: 'smirk', antennae: 'cursor', hat: 'none', pose: 'lean', attitude: 'smug' },
  },
];

// Where people can write to you. Shown as text, not as a mailto link.
export const contactEmail = '[hello@your-domain]';

// Plausible analytics (cookieless). Leave empty to disable.
export const plausibleDomain = '';
