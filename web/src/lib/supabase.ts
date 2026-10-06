import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Only the public (publishable / anon) key ever belongs here. RLS protects the data.
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

export const hasSupabase = supabase !== null;
