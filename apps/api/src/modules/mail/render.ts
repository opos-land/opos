import { type I18n } from '@lingui/core'
import { type EmailContent, linkFallback, linkValidity } from '@opos/i18n/emails'

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/**
 * An email built around one link, in the locale active on `i18n`: a plain text part and a plain
 * HTML part with the same content. Every value is escaped, since the parameters come from users.
 */
export function renderLinkEmail(i18n: I18n, content: EmailContent, link: string): RenderedEmail {
  const subject = i18n._(content.subject)
  const body = i18n._(content.body)
  const action = i18n._(content.action)
  const validity = content.validity === null ? null : i18n._(content.validity ?? linkValidity)
  const fallback = i18n._(linkFallback)
  const ignore = i18n._(content.ignore)

  const text = [body, `${action}: ${link}`, validity, ignore, 'OPOS']
    .filter((part) => part !== null)
    .join('\n\n')

  const href = escapeHtml(link)
  const html = `<!doctype html>
<html lang="${escapeHtml(i18n.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 24px">${escapeHtml(body)}</p>
<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(action)}</a></p>
${validity === null ? '' : `<p style="margin:0 0 8px">${escapeHtml(validity)}</p>\n`}<p style="margin:0 0 24px;font-size:14px">${escapeHtml(fallback)}<br><a href="${href}" style="color:#1a1a1a;word-break:break-all">${href}</a></p>
<p style="margin:0 0 24px;font-size:14px">${escapeHtml(ignore)}</p>
<p style="margin:0;font-size:14px">OPOS</p>
</div>
</body>
</html>
`
  return { subject, text, html }
}
