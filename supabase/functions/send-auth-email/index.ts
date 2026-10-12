import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { button, emailShell, escapeHtml, invitationEmail, sendResend, verifyLink } from '../_shared/email.ts';

type HookUser = { email: string; new_email?: string; user_metadata?: Record<string, unknown> };
type EmailData = {
  token: string; token_hash: string; token_new?: string; token_hash_new?: string;
  redirect_to: string; email_action_type: string; site_url: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const secret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

function content(type: string, link?: string, token?: string, metadata: Record<string, unknown> = {}) {
  type AuthCopy = { subject: string; title: string; copy: string; cta?: string };
  const variants: Record<string, AuthCopy> = {
    signup: { subject: 'Confirm your tech rebels account', title: 'Your bug found a human.', copy: 'Confirm your email to save the bug and continue your tech rebels application.', cta: 'Confirm my email' },
    recovery: { subject: 'Reset your tech rebels password', title: 'Lost the password. Kept the attitude.', copy: 'Use this secure link to choose a new password. If you did not request this, you can ignore the email.', cta: 'Choose a new password' },
    invite: { subject: 'You’re invited to tech rebels', title: 'An invitation escaped containment.', copy: 'Confirm your address to accept the invitation.', cta: 'Accept invitation' },
    magiclink: { subject: 'Your tech rebels sign-in link', title: 'One temporary way inside.', copy: 'Use this one-time link to sign in. If you did not request it, ignore the email.', cta: 'Sign in' },
    email_change: { subject: 'Confirm your new tech rebels email', title: 'New email. Same rebel.', copy: 'Confirm this address to finish changing the email on your account.', cta: 'Confirm new email' },
    password_changed: { subject: 'Your tech rebels password was changed', title: 'Password changed.', copy: 'Your password has just been updated. If this was not you, reset it immediately and contact the crew.' },
  };
  let item: AuthCopy = variants[type] ?? { subject: 'Security notice from tech rebels', title: 'Account security notice.', copy: 'There was a security-related change or request on your tech rebels account.' };
  if (type === 'invite' && link && ['member', 'partner', 'admin'].includes(String(metadata.community_invite_role ?? ''))) {
    return invitationEmail({
      role: String(metadata.community_invite_role) as 'member' | 'partner' | 'admin',
      link,
      message: String(metadata.community_invite_message ?? '').trim() || null,
      newAccount: true,
    });
  }
  const otp = !link && token ? `<p style="margin:18px 0;color:#CDDC27;font:800 28px monospace;letter-spacing:5px">${escapeHtml(token)}</p>` : '';
  const html = emailShell(item.title, item.copy, `<p style="margin:0 0 10px;color:#3DDB9A;font:700 12px monospace;letter-spacing:2px;text-transform:uppercase">Account security</p><h1 style="margin:0 0 16px;color:#EDE7DC;font-size:38px;line-height:1">${escapeHtml(item.title)}</h1><p style="margin:0;color:#C3CBC6;font-size:17px;line-height:1.55">${escapeHtml(item.copy)}</p>${link && item.cta ? button(item.cta, link) : otp}<p style="margin:16px 0 0;color:#87928C;font-size:12px;line-height:1.5">Never send us your password. This link/code is for you only and expires automatically.</p>`);
  return { ...item, html, text: `${item.title}\n\n${item.copy}${link ? `\n\n${link}` : token ? `\n\nCode: ${token}` : ''}` };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('not allowed', { status: 405 });
  try {
    const payload = await request.text();
    const headers = Object.fromEntries(request.headers);
    const { user, email_data: email } = new Webhook(secret).verify(payload, headers) as { user: HookUser; email_data: EmailData };
    const sends: Array<{ to: string; hash?: string; token?: string }> = [];
    if (email.email_action_type === 'email_change' && email.token_hash_new && user.new_email) {
      sends.push({ to: user.email, hash: email.token_hash_new, token: email.token });
      sends.push({ to: user.new_email, hash: email.token_hash, token: email.token_new });
    } else {
      sends.push({ to: email.email_action_type === 'email_change' && user.new_email ? user.new_email : user.email, hash: email.token_hash || email.token_hash_new, token: email.token_new || email.token });
    }
    for (const target of sends) {
      const link = target.hash ? verifyLink(supabaseUrl, target.hash, email.email_action_type, email.redirect_to || email.site_url) : undefined;
      const message = content(email.email_action_type, link, target.token, user.user_metadata ?? {});
      await sendResend({ to: target.to, subject: message.subject, html: message.html, text: message.text });
    }
    return Response.json({});
  } catch (error) {
    return Response.json({ error: { http_code: 401, message: error instanceof Error ? error.message : 'email hook failed' } }, { status: 401 });
  }
});
