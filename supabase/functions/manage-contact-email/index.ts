import { createClient } from 'npm:@supabase/supabase-js@2';
import { emailShell, escapeHtml, sendResend } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const pepper = Deno.env.get('CONTACT_VERIFY_SECRET') ?? '';
type Kind = 'personal' | 'company';

const validEmail = (value: string) => value.length <= 320 && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'not allowed' }, { status: 405, headers: cors });
  if (pepper.length < 32) return Response.json({ error: 'contact verification is not configured' }, { status: 503, headers: cors });
  const auth = request.headers.get('Authorization') ?? '';
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });

  try {
    const body = await request.json() as { action?: 'send' | 'verify'; kind?: Kind; email?: string; code?: string };
    const kind = body.kind as Kind;
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!['personal', 'company'].includes(kind)) throw new Error('invalid email kind');

    if (body.action === 'send') {
      if (!validEmail(email)) throw new Error('enter a valid email');
      const { data: recent } = await admin.from('contact_email_verifications').select('created_at').eq('user_id', userData.user.id).eq('kind', kind).maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at).getTime() < 60000) throw new Error('wait one minute before requesting another code');
      const checks = await Promise.all([
        admin.from('profiles').select('id').eq('email', email).neq('id', userData.user.id).limit(1),
        admin.from('profiles').select('id').eq('personal_email', email).neq('id', userData.user.id).limit(1),
        admin.from('profiles').select('id').eq('company_email', email).neq('id', userData.user.id).limit(1),
      ]);
      if (checks.some((result) => (result.data?.length ?? 0) > 0)) throw new Error('this email is already connected to another account');
      const { data: own } = await admin.from('profiles').select('email,personal_email,company_email,full_name').eq('id', userData.user.id).single();
      if (!own) throw new Error('profile not found');
      if (email === own.email || (kind === 'personal' && email === own.company_email) || (kind === 'company' && email === own.personal_email)) throw new Error('use a different email for each contact slot');
      const random = new Uint32Array(1); crypto.getRandomValues(random);
      const code = String(random[0] % 1000000).padStart(6, '0');
      const codeHash = await digest(`${pepper}:${userData.user.id}:${kind}:${email}:${code}`);
      const { error } = await admin.from('contact_email_verifications').upsert({ user_id: userData.user.id, kind, email, code_hash: codeHash, attempts: 0, expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), created_at: new Date().toISOString() }, { onConflict: 'user_id,kind' });
      if (error) throw error;
      const first = escapeHtml(String(own.full_name || 'rebel').split(/\s+/)[0]);
      const label = kind === 'company' ? 'company' : 'personal';
      const html = emailShell('Verify your contact email', 'Your techRebels verification code.', `<p style="margin:0 0 10px;color:#3DDB9A;font:700 12px monospace;letter-spacing:2px;text-transform:uppercase">Contact settings</p><h1 style="margin:0 0 16px;color:#EDE7DC;font-size:38px;line-height:1">Hey ${first}, verify this ${label} email.</h1><p style="margin:0;color:#C3CBC6;font-size:17px;line-height:1.55">Enter this one-time code in Inside. It expires in 15 minutes.</p><p style="margin:22px 0;color:#CDDC27;font:800 32px monospace;letter-spacing:7px">${code}</p><p style="margin:0;color:#87928C;font-size:12px">If you did not request this, ignore the email.</p>`);
      await sendResend({ to: email, subject: 'Verify your techRebels contact email', html, text: `Your techRebels verification code is ${code}. It expires in 15 minutes.` });
      return Response.json({ ok: true }, { headers: cors });
    }

    if (body.action === 'verify') {
      const code = String(body.code ?? '').trim();
      if (!/^\d{6}$/.test(code)) throw new Error('enter the six-digit code');
      const { data: pending } = await admin.from('contact_email_verifications').select('*').eq('user_id', userData.user.id).eq('kind', kind).maybeSingle();
      if (!pending) throw new Error('request a new verification code');
      if (new Date(pending.expires_at).getTime() <= Date.now()) throw new Error('the verification code has expired');
      if (pending.attempts >= 5) throw new Error('too many attempts; request a new code');
      const candidate = await digest(`${pepper}:${userData.user.id}:${kind}:${pending.email}:${code}`);
      if (candidate !== pending.code_hash) {
        await admin.from('contact_email_verifications').update({ attempts: pending.attempts + 1 }).eq('user_id', userData.user.id).eq('kind', kind);
        throw new Error('the verification code is incorrect');
      }
      const column = kind === 'personal' ? 'personal_email' : 'company_email';
      const { error } = await admin.from('profiles').update({ [column]: pending.email }).eq('id', userData.user.id);
      if (error) throw error;
      await admin.from('contact_email_verifications').delete().eq('user_id', userData.user.id).eq('kind', kind);
      return Response.json({ ok: true, email: pending.email, kind }, { headers: cors });
    }
    throw new Error('invalid action');
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'request failed' }, { status: 400, headers: cors });
  }
});
