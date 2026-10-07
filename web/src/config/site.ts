export { links, session, plausibleDomain } from './links';

export const site = {
  name: 'techRebels',
  title: "techRebels · Rebels don't do safe mode.",
  description: 'A tech lunapark in Prague for curious people in tech. Real projects, real bugs, zero status games.',

  claims: {
    bugs: ['WORKING AS UNINTENDED.', 'BE THE BUG.', 'UNEXPECTED BY DESIGN.', 'TOO WEIRD TO PATCH.', "STATUS: WON'T FIX."],
    rebels: ['ATTITUDE IS A FEATURE.', 'WE REBEL AGAINST BORING.', 'NORMAL WAS NEVER THE PLAN.', 'SAME SYSTEM. DIFFERENT ATTITUDE.', 'NOT MADE FOR SAFE MODE.'],
    lunapark: ['LESS CONFERENCE. MORE CARNIVAL.', 'COME FOR THE TECH. STAY FOR THE CHAOS.', 'NO INNOVATION WITHOUT PLAY.', 'SERIOUS EXPERIMENTS. STUPID AMOUNTS OF FUN.'],
    // The claims chosen for the website (marquee). Placement: hero, pillars, wall, FAQ, final CTA.
    web: [
      "REBELS DON'T FOLLOW ROADMAPS.",
      'ATTITUDE IS A FEATURE.',
      'WORKING AS UNINTENDED.',
      'REBELS BREAK THINGS NICELY.',
      'NORMAL WAS NEVER THE PLAN.',
      "REBELS DON'T DO SAFE MODE.",
      'EVERY DEMO IS A RIDE.',
      'RIDES, DEMOS AND BAD IDEAS.',
      'EXPERIMENTS OVER KEYNOTES.',
      'THE FUTURE IS A FUNFAIR.',
      'BE THE BUG.',
    ],
    // "Rebels ..." lines. The first one is the V2 hero headline.
    rebelLines: [
      "Rebels don't follow roadmaps.",
      'Rebels show their bugs.',
      'Rebels ship weird.',
      'Rebels break things nicely.',
      'Rebels debug out loud.',
      'Rebels skip the small talk.',
      'Rebels build. Bugs included.',
      "Rebels don't do safe mode.",
      'Rebels play with tech.',
      'Rebels welcome. Bugs too.',
    ],
  },

  // order used by the hero claim rotator
  rotator: [
    'BE THE BUG.', 'ATTITUDE IS A FEATURE.', 'TOO WEIRD TO PATCH.', 'NORMAL WAS NEVER THE PLAN.',
    'NO INNOVATION WITHOUT PLAY.', 'WORKING AS UNINTENDED.', 'WE REBEL AGAINST BORING.',
    'UNEXPECTED BY DESIGN.', 'NOT MADE FOR SAFE MODE.', 'COME FOR THE TECH. STAY FOR THE CHAOS.',
  ],
};
