import { createClient } from 'npm:@supabase/supabase-js@2';
import { button, emailShell, escapeHtml, sendResend } from '../_shared/email.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const siteUrl = (Deno.env.get('SITE_URL') ?? 'http://127.0.0.1:4321').replace(/\/$/, '');

type InviteRole = 'member' | 'partner' | 'admin';
const roles: InviteRole[] = ['member', 'partner', 'admin'];

function validEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function roleLabel(role: InviteRole) {
  return role === 'admin' ? 'techRebels admin' : role === 'partner' ? 'techRebels partner' : 'techRebels member';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'not allowed' }, { status: 405, headers: cors });

  const auth = request.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return Response.json({ error: 'unauthorized' }, { status: 401, headers: cors });

  const { data: adminRow } = await admin.from('admins').select('user_id').eq('user_id', userData.user.id).maybeSingle();
  if (!adminRow) return Response.json({ error: 'admins only' }, { status: 403, headers: cors });

  try {
    const body = await request.json() as {
      action?: 'invite' | 'revoke' | 'suspend_member' | 'restore_member' | 'remove_role' | 'delete_account';
      email?: string; role?: InviteRole; message?: string; inviteId?: string;
      targetUserId?: string; confirmationEmail?: string;
    };

    if (['suspend_member', 'restore_member', 'remove_role', 'delete_account'].includes(body.action ?? '')) {
      if (!body.targetUserId || !/^[0-9a-f-]{36}$/i.test(body.targetUserId)) throw new Error('valid target user is required');
      const { error } = await admin.rpc('admin_manage_person', {
        p_actor_id: userData.user.id,
        p_target_id: body.targetUserId,
        p_action: body.action,
        p_role: body.action === 'remove_role' ? body.role ?? null : null,
        p_confirmation_email: body.action === 'delete_account' ? body.confirmationEmail ?? null : null,
      });
      if (error) throw error;
      return Response.json({ ok: true }, { headers: cors });
    }

    if (body.action === 'revoke') {
      if (!body.inviteId) throw new Error('invitation id is required');
      const { data: invitation, error } = await admin.from('community_invites')
        .update({ status: 'revoked' })
        .eq('id', body.inviteId).eq('status', 'pending')
        .select('id,email,role').maybeSingle();
      if (error) throw error;
      if (!invitation) throw new Error('active invitation not found');
      await admin.from('admin_audit_log').insert({
        actor_id: userData.user.id, action: 'invite_revoked',
        details: { invite_id: invitation.id, email: invitation.email, role: invitation.role },
      });
      return Response.json({ ok: true }, { headers: cors });
    }

    if (body.action !== 'invite') throw new Error('invalid action');
    const email = String(body.email ?? '').trim().toLowerCase();
    const role = body.role as InviteRole;
    const message = String(body.message ?? '').trim().slice(0, 600) || null;
    if (!validEmail(email)) throw new Error('enter a valid email');
    if (!roles.includes(role)) throw new Error('invalid invitation role');

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin.from('community_invites')
      .select('id').eq('email', email).eq('role', role).eq('status', 'pending').maybeSingle();
    const invitationResult = existing
      ? await admin.from('community_invites').update({ message, expires_at: expiresAt }).eq('id', existing.id).select('id').single()
      : await admin.from('community_invites').insert({ email, role, message, invited_by: userData.user.id, expires_at: expiresAt }).select('id').single();
    if (invitationResult.error || !invitationResult.data) throw invitationResult.error ?? new Error('invitation could not be created');
    const invitationId = invitationResult.data.id as string;
    const redirectTo = `${siteUrl}/accept-invite?invite=${encodeURIComponent(invitationId)}`;

    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (profile?.id) {
      await admin.from('community_invites').update({ invited_user_id: profile.id }).eq('id', invitationId);
      const label = roleLabel(role);
      const personal = message ? `<p style="margin:18px 0 0;padding:16px;border-left:3px solid #CDDC27;color:#EDE7DC">${escapeHtml(message)}</p>` : '';
      const html = emailShell(`Invitation to become a ${label}`, 'A new techRebels role is waiting for you.', `<p style="margin:0 0 10px;color:#3DDB9A;font:700 12px monospace;letter-spacing:2px;text-transform:uppercase">Crew invitation · expires in 7 days</p><h1 style="margin:0 0 16px;color:#EDE7DC;font-size:38px;line-height:1">Become a ${escapeHtml(label)}.</h1><p style="margin:0;color:#C3CBC6;font-size:17px;line-height:1.55">The crew invited this account to accept a new role. Sign in with this email to continue.</p>${personal}${button('Review invitation', redirectTo, '#CDDC27')}`);
      await sendResend({ to: email, subject: `Your ${label} invitation`, html, text: `You have been invited to become a ${label}.\n\n${message ? `${message}\n\n` : ''}${redirectTo}` });
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { community_invite_id: invitationId, community_invite_role: role },
      });
      if (inviteError) {
        await admin.from('community_invites').update({ status: 'revoked' }).eq('id', invitationId);
        throw inviteError;
      }
      if (invited.user) await admin.from('community_invites').update({ invited_user_id: invited.user.id }).eq('id', invitationId);
    }

    await admin.from('admin_audit_log').insert({
      actor_id: userData.user.id, target_user_id: profile?.id ?? null, action: existing ? 'invite_resent' : 'invite_created',
      details: { invite_id: invitationId, email, role, expires_at: expiresAt },
    });
    return Response.json({ ok: true, invitationId }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'request failed';
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
