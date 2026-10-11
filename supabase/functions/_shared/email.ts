export const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const emailShell = (title: string, preview: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#0B0F0D;color:#EDE7DC;font-family:Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0F0D"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border:1px solid #29302C;border-radius:24px;background:#111713;overflow:hidden">
<tr><td style="padding:28px 32px 18px"><div style="font-size:25px;font-weight:900;line-height:.8;letter-spacing:-1px;color:#F4A5D4">tech<br>Rebels</div></td></tr>
<tr><td style="padding:12px 32px 34px">${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #29302C;color:#87928C;font-family:monospace;font-size:12px">STATUS: WON'T FIX · PRAGUE<br>This is a transactional account email from techRebels.</td></tr>
</table></td></tr></table></body></html>`;

export const button = (label: string, href: string, color = '#F4A5D4') =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin:18px 0 8px;padding:14px 22px;border-radius:999px;background:${color};color:#0B0F0D;text-decoration:none;font-weight:800">${escapeHtml(label)} →</a>`;

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
