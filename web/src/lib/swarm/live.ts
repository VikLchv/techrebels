// One Realtime subscription per page to the public "swarm" channel (event "new_bug").
// Several parts of a page (nav counter, swarm stage, event screen) can listen.
import { supabase } from '../supabase';
import type { SwarmBug } from './orbit';

type Listener = (bug: SwarmBug) => void;
const listeners: Listener[] = [];
let subscribed = false;

export function onNewBug(cb: Listener) {
  listeners.push(cb);
  if (subscribed || !supabase) return;
  subscribed = true;
  supabase.channel('swarm').on('broadcast', { event: 'new_bug' }, ({ payload }) => {
    const b = payload as SwarmBug;
    if (!b || typeof b.bug_number !== 'number') return;
    for (const l of listeners) l(b);
  }).subscribe();
}
