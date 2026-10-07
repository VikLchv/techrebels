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

// The crew shown in "Who's behind it". Replace [role] and the one-liners with your own words.
export const crew = [
  {
    name: 'Vik', bugName: 'Kernel Vik', role: '[role]', line: '[one line about Vik]', tile: 'var(--purple)',
    bug: { role: 'dev', shape: 'round', shell: 'pink', pattern: 'code', eyes: 'visor', mouth: 'fangs', antennae: 'plug', hat: 'headphones', pose: 'stand', attitude: 'rebel' },
  },
  {
    name: 'Any', bugName: '[bug name]', role: '[role]', line: '[one line about Any]', tile: 'var(--lime)',
    bug: { role: 'people', shape: 'tall', shell: 'green', pattern: 'dots', eyes: 'googly', mouth: 'smile', antennae: 'match', hat: 'none', pose: 'wave', attitude: 'excited', extra: 'freckles' },
  },
  {
    name: 'Tom', bugName: '[bug name]', role: '[role]', line: '[one line about Tom]', tile: 'var(--pink)',
    bug: { role: 'design', shape: 'wide', shell: 'purple', pattern: 'pixels', eyes: 'visor', eyewear: 'glasses', mouth: 'smirk', antennae: 'cursor', hat: 'beret', pose: 'lean', attitude: 'smug' },
  },
];

// Where people can write to you. Shown as text, not as a mailto link.
export const contactEmail = '[hello@your-domain]';

// Plausible analytics (cookieless). Leave empty to disable.
export const plausibleDomain = '';
