// The techRebels story as patch notes. Newest first. Edit freely: dates are rough on purpose.
export type Change = { type: 'feat' | 'fix' | 'removed' | 'known' | 'chore' | 'planned'; text: string };
export type Release = { version: string; date: string; title: string; status?: 'released' | 'upcoming'; changes: Change[] };

export const changelog: Release[] = [
  {
    version: 'v2027.0', date: 'autumn 2027', title: 'Tech Lunapark', status: 'upcoming',
    changes: [
      { type: 'planned', text: 'A full tech funfair: demos you can ride, experiments you can break.' },
      { type: 'planned', text: 'Time capsule opens. We find out who was right about tech.' },
      { type: 'known', text: 'Pink drinks may cause bugs.' },
    ],
  },
  {
    version: 'v1.0.0', date: 'soon', title: 'Rebel Session #01', status: 'upcoming',
    changes: [
      { type: 'planned', text: 'First live session in Prague. Topics picked on the Radar.' },
      { type: 'planned', text: 'First incident report, written by the people who were there.' },
      { type: 'fix', text: 'Meetups where nobody talks to anybody. Hopefully.' },
    ],
  },
  {
    version: 'v0.5.0', date: 'October 2026', title: 'Safe mode removed',
    changes: [
      { type: 'feat', text: 'The site now boots broken. You fix it to get in.' },
      { type: 'feat', text: 'Lunapark Bug Rush, the first game inside.' },
      { type: 'feat', text: 'Rebel mode. Press at your own risk.' },
      { type: 'removed', text: 'Safe mode. It is not coming back.' },
    ],
  },
  {
    version: 'v0.4.0', date: 'October 2026', title: 'The swarm goes live',
    changes: [
      { type: 'feat', text: 'Website with the Swarm, Rebel Radar, The Drop and Inside.' },
      { type: 'feat', text: 'Founder bugs get the lowest numbers. BUG-0000 is taken.' },
      { type: 'chore', text: 'Tom joins the crew as Creative & Design Guru. The bugs finally get a stylist.' },
    ],
  },
  {
    version: 'v0.3.0', date: 'autumn 2026', title: 'Bug Lab',
    changes: [
      { type: 'feat', text: 'Every rebel builds their own bug: role, body, pose, attitude.' },
      { type: 'feat', text: 'Twelve roles, because tech is not only devs.' },
      { type: 'fix', text: 'Bugs were all developers. Now marketers, founders and the just curious get one too.' },
    ],
  },
  {
    version: 'v0.2.0', date: 'autumn 2026', title: 'Naming things',
    changes: [
      { type: 'feat', text: 'Name: techRebels. Claim: Rebels don\'t do safe mode.' },
      { type: 'removed', text: 'The idea of a single mascot. We went with a whole swarm.' },
      { type: 'known', text: 'Naming things is still one of the two hard problems.' },
    ],
  },
  {
    version: 'v0.1.0', date: 'the beginning', title: 'Hello, world',
    changes: [
      { type: 'feat', text: 'Founded on a call by Any and Vik.' },
      { type: 'fix', text: 'Boredom at tech meetups (work in progress).' },
      { type: 'known', text: 'No name, no logo, no budget. Plenty of opinions.' },
    ],
  },
];
