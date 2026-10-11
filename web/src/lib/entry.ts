// Entry tickets: an infection code from a member or the intro exploit.
// Kept in the browser until the person is signed in, then redeemed for a priority spot in the review queue.
import type { SupabaseClient } from '@supabase/supabase-js';

const KEY_INVITE = 'tr-infect';
const KEY_EXPLOIT = 'tr-exploit';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

export const rememberInfection = (code: string) => set(KEY_INVITE, code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
export const rememberExploit = (code: string) => set(KEY_EXPLOIT, code);
export const pendingTicket = () => (get(KEY_INVITE) ? 'invite' : get(KEY_EXPLOIT) ? 'exploit' : null);

/** Redeem whatever ticket is waiting. Returns the route that worked, or null. */
export async function redeemTicket(supabase: SupabaseClient | null): Promise<'invite' | 'exploit' | null> {
  if (!supabase) return null;
  const invite = get(KEY_INVITE);
  if (invite) {
    const { error } = await supabase.rpc('claim_infection', { p_code: invite });
    set(KEY_INVITE, null); // a code is single use: drop it whether it worked or not
    if (!error) { set(KEY_EXPLOIT, null); return 'invite'; }
  }
  const exploit = get(KEY_EXPLOIT);
  if (exploit) {
    const { error } = await supabase.rpc('claim_exploit', { p_code: exploit });
    set(KEY_EXPLOIT, null);
    if (!error) return 'exploit';
  }
  return null;
}
