export const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const emailShell = (title: string, preview: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#0B0F0D;color:#EDE7DC;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0F0D"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #29302C;border-radius:24px;background:#111713;overflow:hidden">
<tr><td style="padding:28px 32px 18px"><div style="font-size:25px;font-weight:900;line-height:.8;letter-spacing:-1px;color:#F4A5D4">tech<br>rebels</div></td></tr>
<tr><td style="padding:12px 32px 34px">${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #29302C;color:#87928C;font-family:monospace;font-size:12px">STATUS: WON'T FIX · PRAGUE<br>This is a transactional account email from tech rebels.</td></tr>
</table></td></tr></table></body></html>`;

export const button = (label: string, href: string, color = '#F4A5D4') =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin:18px 0 8px;padding:14px 22px;border-radius:999px;background:${color};color:#0B0F0D;text-decoration:none;font-weight:800">${escapeHtml(label)} →</a>`;

export type InvitationRole = 'member' | 'partner' | 'admin';

export function invitationEmail(options: {
  role: InvitationRole;
  link: string;
  message?: string | null;
  newAccount: boolean;
}) {
  const variants = {
    member: {
      subject: 'Your place in the tech rebels swarm',
      title: 'There’s a place in the swarm with your name on it.',
      copy: 'The crew invited you to join tech rebels as a member. Inside, the Radar, matching and member drops will open as soon as you accept.',
      cta: 'Join the swarm',
      color: '#F4A5D4',
      label: 'member',
    },
    partner: {
      subject: 'Let’s build something strange together',
      title: 'You’re invited behind the scenes.',
      copy: 'The crew invited you into the private tech rebels Partner Space. This invitation adds partner access without changing any access you already have.',
      cta: 'Open partner invitation',
      color: '#3DDB9A',
      label: 'partner',
    },
    admin: {
      subject: 'The tech rebels control room is calling',
      title: 'The control room wants you.',
      copy: 'You’ve been invited to tech rebels with admin access. Accepting opens both member Inside and the private Control Room.',
      cta: 'Enter the control room',
      color: '#CDDC27',
      label: 'admin',
    },
  }[options.role];
  const next = options.newAccount
    ? 'The secure link signs you in. Choose a password and accept the invitation within 7 days.'
    : 'The secure link signs you into your existing account. Review and accept the new access within 7 days; your password will not change.';
  const personal = options.message
    ? `<div style="margin:22px 0 2px;padding:16px 18px;border-left:3px solid #CDDC27;border-radius:0 12px 12px 0;background:#171E1A"><p style="margin:0 0 7px;color:#87928C;font:700 11px monospace;letter-spacing:1.5px;text-transform:uppercase">A note from the crew</p><p style="margin:0;color:#EDE7DC;font-size:16px;line-height:1.55">“${escapeHtml(options.message)}”</p></div>`
    : '';
  const preview = `${variants.title} Private invitation · expires in 7 days.`;
  const html = emailShell(variants.title, preview, `
    <p style="margin:0 0 10px;color:#3DDB9A;font:700 12px monospace;letter-spacing:2px;text-transform:uppercase">Private invitation · ${variants.label} · expires in 7 days</p>
    <h1 style="margin:0 0 16px;color:#EDE7DC;font-size:38px;line-height:1">${variants.title}</h1>
    <p style="margin:0 0 12px;color:#C3CBC6;font-size:17px;line-height:1.55">${variants.copy}</p>
    <p style="margin:0;color:#87928C;font-size:14px;line-height:1.55">${next}</p>
    ${personal}
    ${button(variants.cta, options.link, variants.color)}
    <p style="margin:14px 0 0;color:#87928C;font-size:12px;line-height:1.5">This is a private, one-time sign-in link for ${variants.label} access. If you were not expecting it, ignore this email; no access is granted until the invitation is accepted.</p>`);
  const text = [
    variants.title,
    variants.copy,
    next,
    options.message ? `A note from the crew: “${options.message}”` : '',
    `${variants.cta}: ${options.link}`,
    'If you were not expecting this invitation, ignore this email.',
  ].filter(Boolean).join('\n\n');
  return { ...variants, html, text };
}

export async function sendResend(message: {
  to: string; subject: string; html: string; text: string;
  attachments?: Array<{ filename: string; content: string; content_id: string; content_type: string }>;
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM');
  const replyTo = Deno.env.get('RESEND_REPLY_TO');
  if (!apiKey || !from) throw new Error('RESEND_API_KEY or RESEND_FROM is missing');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [message.to], ...(replyTo ? { reply_to: replyTo } : {}), ...message }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || `Resend returned ${response.status}`);
  return data as { id: string };
}

export function verifyLink(supabaseUrl: string, tokenHash: string, type: string, redirectTo: string) {
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) binary += String.fromCharCode(...bytes.subarray(i, i + size));
  return btoa(binary);
};
