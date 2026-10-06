export { links, session, plausibleDomain } from './links';

export const site = {
  name: 'techRebels',
  title: 'techRebels · Less conference. More carnival.',
  description: 'A tech lunapark in Prague for curious people in tech. Real projects, real bugs, zero status games.',

  claims: {
    bugs: ['WORKING AS UNINTENDED.', 'BE THE BUG.', 'UNEXPECTED BY DESIGN.', 'TOO WEIRD TO PATCH.', "STATUS: WON'T FIX."],
    rebels: ['ATTITUDE IS A FEATURE.', 'WE REBEL AGAINST BORING.', 'NORMAL WAS NEVER THE PLAN.', 'SAME SYSTEM. DIFFERENT ATTITUDE.', 'NOT MADE FOR SAFE MODE.'],
    lunapark: ['LESS CONFERENCE. MORE CARNIVAL.', 'COME FOR THE TECH. STAY FOR THE CHAOS.', 'NO INNOVATION WITHOUT PLAY.', 'SERIOUS EXPERIMENTS. STUPID AMOUNTS OF FUN.'],
  },

  // order used by the hero claim rotator
  rotator: [
    'BE THE BUG.', 'ATTITUDE IS A FEATURE.', 'TOO WEIRD TO PATCH.', 'NORMAL WAS NEVER THE PLAN.',
    'NO INNOVATION WITHOUT PLAY.', 'WORKING AS UNINTENDED.', 'WE REBEL AGAINST BORING.',
    'UNEXPECTED BY DESIGN.', 'NOT MADE FOR SAFE MODE.', 'COME FOR THE TECH. STAY FOR THE CHAOS.',
  ],
};
