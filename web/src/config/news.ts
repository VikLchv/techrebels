// "What's happening" on the home page. Newest first within each group.
// when: 'now' (live), 'next' (coming up) or 'past' (done, worth talking about).
import { links } from './links';

export type NewsItem = { when: 'now' | 'next' | 'past'; date: string; tag: string; title: string; text: string; href?: string; cta?: string };

export const news: NewsItem[] = [
  {
    when: 'now', date: 'Open', tag: 'Bug Lab',
    title: 'Build your bug.',
    text: 'The Bug Lab is open. Pick a role, a pose and an attitude, save your bug and you are in the swarm.',
    href: '/lab', cta: 'Open the lab',
  },
  {
    when: 'next', date: '[date]', tag: 'Session',
    title: 'Rebel Session #01',
    text: 'One real project, all the bugs. 30 to 50 people in Prague, then drinks and a bug swap.',
    href: links.lumaSession, cta: 'Get on the list',
  },
  {
    when: 'next', date: 'Soon', tag: 'Merch',
    title: 'Founding Drop 001',
    text: 'Limited, numbered, pre-order only. Members get first access and a patch with their own bug ID.',
    href: '/drop', cta: 'See the drop',
  },
  {
    when: 'past', date: 'October 2026', tag: 'Brand',
    title: 'techRebels got its look.',
    text: 'No single mascot: a whole swarm of bugs. Plus a brand manual, three claim pillars and the first merch concepts.',
    href: '/manifesto', cta: 'Read the manifesto',
  },
];
