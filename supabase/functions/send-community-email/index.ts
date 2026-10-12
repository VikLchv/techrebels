import { createClient } from 'npm:@supabase/supabase-js@2';
import { button, bytesToBase64, emailShell, escapeHtml, sendResend } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:4321').replace(/\/$/, '');

type Kind = 'welcome' | 'application_received' | 'membership_approved';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'not allowed' }, { status: 405, headers: cors });
  const auth = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });
  let deliveryKind: Kind | null = null;
  let deliveryUserId = userData.user.id;

  try {
    const body = await request.json() as { kind?: Kind; userId?: string };
    if (!['welcome', 'application_received', 'membership_approved'].includes(body.kind ?? '')) throw new Error('invalid email kind');
    const kind = body.kind as Kind;
    deliveryKind = kind;
    let targetId = userData.user.id;
    if (kind === 'membership_approved') {
      const { data: adminRow } = await admin.from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
      if (!adminRow || !body.userId) return Response.json({ error: 'admins only' }, { status: 403, headers: cors });
      targetId = body.userId;
    } else if (body.userId && body.userId !== userData.user.id) {
      return Response.json({ error: 'cannot email another user' }, { status: 403, headers: cors });
    }
    deliveryUserId = targetId;

    const { data: existing } = await admin.from('email_deliveries').select('status,created_at').eq('user_id', targetId).eq('kind', kind).maybeSingle();
    if (existing?.status === 'sent') return Response.json({ ok: true, duplicate: true }, { headers: cors });
    if (existing?.status === 'sending' && Date.now() - new Date(existing.created_at).getTime() < 120000) return Response.json({ ok: true, pending: true }, { headers: cors });
    await admin.from('email_deliveries').upsert({ user_id: targetId, kind, status: 'sending', last_error: null }, { onConflict: 'user_id,kind' });

    const [{ data: profile }, { data: bug }] = await Promise.all([
      admin.from('profiles').select('email,full_name,membership_status').eq('id', targetId).single(),
      admin.from('bugs').select('bug_number,name').eq('user_id', targetId).maybeSingle(),
    ]);
    if (!profile?.email) throw new Error('recipient profile has no email');
    if (kind === 'membership_approved' && profile.membership_status !== 'approved') throw new Error('membership is not approved');
    const first = escapeHtml((profile.full_name || 'rebel').split(/\s+/)[0]);
    const bugId = bug ? `BUG-${String(bug.bug_number).padStart(4, '0')}` : 'YOUR BUG';
    const bugName = escapeHtml(bug?.name || 'Unnamed bug');

    let image = '';
    const attachments: Array<{ filename: string; content: string; content_id: string; content_type: string }> = [];
    const { data: card } = await admin.storage.from('bug-email').download(`${targetId}/welcome.png`);
    if (card) {
      attachments.push({ filename: `${bugId.toLowerCase()}.png`, content: bytesToBase64(new Uint8Array(await card.arrayBuffer())), content_id: 'rebel-bug', content_type: 'image/png' });
      image = '<img src="cid:rebel-bug" width="360" alt="Your Rebel Bug card" style="display:block;width:100%;max-width:360px;height:auto;margin:22px auto;border-radius:18px">';
    }

    const variants = {
      welcome: {
        subject: `${bugId} is alive.`, title: `Hey ${first}, your bug made it through the lab.`,
        copy: `${bugId} · ${bugName} is saved privately. Finish the short application and the crew will take it from there.`,
        cta: 'Finish my application', href: `${siteUrl}/inside`, preview: 'Your Rebel Bug is saved. One last step.',
      },
      application_received: {
        subject: 'Your tech rebels application is with the crew', title: `Got it, ${first}.`,
        copy: `Your application and ${bugId} are with the crew. We review every application personally; your status will update in Inside.`,
        cta: 'Check my status', href: `${siteUrl}/inside`, preview: 'The crew has your application.',
      },
      membership_approved: {
        subject: `You’re in. Welcome to the swarm.`, title: `You’re in, ${first}.`,
        copy: `${bugId} · ${bugName} has joined the public swarm. Inside is now fully open: profile, Radar, matching and the Drop.`,
        cta: 'Enter Inside', href: `${siteUrl}/inside`, preview: 'Your tech rebels membership is approved.',
      },
    }[kind];
    const html = emailShell(variants.title, variants.preview, `<p style="margin:0 0 10px;color:#3DDB9A;font:700 12px monospace;letter-spacing:2px;text-transform:uppercase">${escapeHtml(bugId)} · transactional update</p><h1 style="margin:0 0 16px;color:#EDE7DC;font-size:38px;line-height:1">${variants.title}</h1><p style="margin:0;color:#C3CBC6;font-size:17px;line-height:1.55">${variants.copy}</p>${image}${button(variants.cta, variants.href, kind === 'membership_approved' ? '#CDDC27' : '#F4A5D4')}`);
    const result = await sendResend({ to: profile.email, subject: variants.subject, html, text: `${variants.title}\n\n${variants.copy}\n\n${variants.href}`, attachments: attachments.length ? attachments : undefined });
    await admin.from('email_deliveries').update({ status: 'sent', provider_id: result.id, sent_at: new Date().toISOString() }).eq('user_id', targetId).eq('kind', kind);
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'email failed';
    if (deliveryKind) await admin.from('email_deliveries').update({ status: 'failed', last_error: message.slice(0, 1000) }).eq('user_id', deliveryUserId).eq('kind', deliveryKind);
    return Response.json({ error: message }, { status: 500, headers: cors });
  }
});
