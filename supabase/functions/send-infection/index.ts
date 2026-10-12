// Sends one of a member's infection codes to a friend as a branded "infection detected" email.
// The recipient's address is used for this one email only and is never stored.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { button, bytesToBase64, emailShell, escapeHtml, sendResend } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:4321').replace(/\/$/, '');
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'not allowed' }, { status: 405, headers: cors });
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
  const caller = userData.user.id;

  try {
    const body = await request.json() as { code?: string; email?: string; note?: string };
    const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const to = String(body.email ?? '').trim();
    const note = String(body.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 280);
    if (!/^[A-Z0-9]{8}$/.test(code)) return Response.json({ error: 'invalid code' }, { status: 400, headers: cors });
    if (!EMAIL.test(to) || to.length > 254) return Response.json({ error: 'invalid email' }, { status: 400, headers: cors });
    if (to.toLowerCase() === (userData.user.email ?? '').toLowerCase()) return Response.json({ error: 'you cannot infect yourself' }, { status: 400, headers: cors });

    // the code must be the caller's own, unused, and not spammed
    const { data: inf } = await admin.from('infections').select('id,claimed_by,emailed_at,email_count').eq('code', code).eq('inviter', caller).maybeSingle();
    if (!inf) return Response.json({ error: 'not your code' }, { status: 403, headers: cors });
    if (inf.claimed_by) return Response.json({ error: 'this code was already caught' }, { status: 409, headers: cors });
    if ((inf.email_count ?? 0) >= 3) return Response.json({ error: 'this vial was emailed enough times' }, { status: 429, headers: cors });
    if (inf.emailed_at && Date.now() - new Date(inf.emailed_at).getTime() < 10 * 60 * 1000) return Response.json({ error: 'wait a few minutes before resending' }, { status: 429, headers: cors });

    const [{ data: member }, { data: bug }] = await Promise.all([
      admin.from('profiles').select('full_name,membership_status').eq('id', caller).single(),
      admin.from('bugs').select('bug_number,name').eq('user_id', caller).maybeSingle(),
    ]);
    if (member?.membership_status !== 'approved' && !(await admin.from('admins').select('user_id').eq('user_id', caller).maybeSingle()).data) {
      return Response.json({ error: 'members only' }, { status: 403, headers: cors });
    }
    const first = escapeHtml((member?.full_name || 'A rebel').split(/\s+/)[0]);
    const bugId = bug ? `BUG-${String(bug.bug_number).padStart(4, '0')}` : 'A rebel bug';
    const bugName = escapeHtml(bug?.name || '');
    const link = `${siteUrl}/lab?infect=${code}`;
    const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;

    // the infecting bug's card, if the member already has one in the private email bucket
    let image = '';
    const attachments: Array<{ filename: string; content: string; content_id: string; content_type: string }> = [];
    const { data: card } = await admin.storage.from('bug-email').download(`${caller}/welcome.png`);
    if (card) {
      attachments.push({ filename: `${bugId.toLowerCase()}.png`, content: bytesToBase64(new Uint8Array(await card.arrayBuffer())), content_id: 'patient-zero', content_type: 'image/png' });
      image = `<img src="cid:patient-zero" width="300" alt="${escapeHtml(bugId)}, the bug that infected you" style="display:block;width:100%;max-width:300px;height:auto;margin:22px 0;border-radius:18px">`;
    }

    const noteHtml = note
      ? `<div style="margin:20px 0 4px;padding:14px 16px;border-left:4px solid #F4A5D4;background:#1A2420;border-radius:0 12px 12px 0;color:#EDE7DC;font-size:16px;line-height:1.5"><span style="display:block;margin-bottom:6px;color:#87928C;font:700 11px monospace;letter-spacing:2px">NOTE FROM ${first.toUpperCase()}</span>${escapeHtml(note)}</div>`
      : '';
    const html = emailShell(`${bugId} infected you`, 'Symptoms: curiosity, strong opinions, sudden urge to build things.', `
      <p style="margin:0 0 12px;display:inline-block;padding:6px 10px;border-radius:8px;background:#CDDC27;color:#0B0F0D;font:800 12px monospace;letter-spacing:2px">⚠ INFECTION DETECTED · ${pretty}</p>
      <h1 style="margin:0 0 16px;color:#EDE7DC;font-size:40px;line-height:1">You've been infected.</h1>
      <p style="margin:0;color:#C3CBC6;font-size:17px;line-height:1.55"><b style="color:#F4A5D4">${first}</b> (${escapeHtml(bugId)}${bugName ? ` · ${bugName}` : ''}) thinks you belong in <b style="color:#EDE7DC">tech rebels</b>, a Prague club for people who build, break and rethink tech. Devs, designers, marketers, founders and the just curious.</p>
      ${noteHtml}
      ${image}
      <p style="margin:18px 0 0;color:#87928C;font:700 12px monospace;letter-spacing:1px">SYMPTOMS</p>
      <p style="margin:6px 0 0;color:#C3CBC6;font-size:15px;line-height:1.6">Curiosity · strong opinions about tabs vs spaces · a sudden urge to build things · laughing at stand-up jokes nobody else gets.</p>
      ${button('Catch the bug', link, '#CDDC27')}
      <p style="margin:8px 0 0;color:#87928C;font-size:13px;line-height:1.5">Treatment: build your own bug, apply, and your application skips the queue. The code works once.<br>You got this because ${first} typed your address. We do not keep it and will not email you again.</p>`);
    const text = `You've been infected.\n\n${member?.full_name?.split(/\s+/)[0] ?? 'A rebel'} (${bugId}) thinks you belong in tech rebels, a Prague club for people who build, break and rethink tech.${note ? `\n\nNote: ${note}` : ''}\n\nCatch the bug: ${link}\nInfection code: ${pretty} (works once)\n\nYou got this because a member typed your address. We do not keep it.`;

    await sendResend({ to, subject: `${bugId} infected you with tech rebels`, html, text, attachments: attachments.length ? attachments : undefined });
    await admin.from('infections').update({ emailed_at: new Date().toISOString(), email_count: (inf.email_count ?? 0) + 1 }).eq('id', inf.id);
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    console.error('send-infection failed', error);
    return Response.json({ error: 'sending failed' }, { status: 500, headers: cors });
  }
});
