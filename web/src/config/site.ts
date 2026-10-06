// Everything the team may want to change without touching code lives here.
export const site = {
  name: 'techRebels',
  title: 'techRebels · Less conference. More carnival.',
  description: 'A tech lunapark in Prague. Real projects, real bugs, zero status games.',

  session: {
    name: 'Rebel Session #01',
    date: '[date]',
    venue: '[venue]',
    city: 'Prague',
    people: '30 to 50 people',
    length: '90 min',
  },

  links: {
    lumaCalendar: '#',
    lumaSession: '#',
    instagram: '#',
    linkedin: '#',
    slackInvite: '#', // only shown to members, never on public pages
  },

  claims: {
    bugs: ['WORKING AS UNINTENDED.', 'BE THE BUG.', 'UNEXPECTED BY DESIGN.', 'TOO WEIRD TO PATCH.', "STATUS: WON'T FIX."],
    rebels: ['ATTITUDE IS A FEATURE.', 'WE REBEL AGAINST BORING.', 'NORMAL WAS NEVER THE PLAN.', 'SAME SYSTEM. DIFFERENT ATTITUDE.', 'NOT MADE FOR SAFE MODE.'],
    lunapark: ['LESS CONFERENCE. MORE CARNIVAL.', 'COME FOR THE TECH. STAY FOR THE CHAOS.', 'NO INNOVATION WITHOUT PLAY.', 'SERIOUS EXPERIMENTS. STUPID AMOUNTS OF FUN.'],
  },
} as const;
