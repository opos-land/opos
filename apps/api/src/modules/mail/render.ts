import { type I18n, type MessageDescriptor } from '@lingui/core'
import {
  type EmailContent,
  linkFallback,
  linkValidity,
  type NoticeContent,
} from '@opos/i18n/emails'
import { type OrderEmailContent } from '@opos/i18n/order-emails'

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

/** A notice without a link, in the locale active on `i18n`: the same two parts and layout. */
export function renderNoticeEmail(i18n: I18n, content: NoticeContent): RenderedEmail {
  const subject = i18n._(content.subject)
  const body = i18n._(content.body)
  const note = i18n._(content.note)

  const text = [body, note, 'OPOS'].join('\n\n')
  const html = `<!doctype html>
<html lang="${escapeHtml(i18n.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto">
<p style="margin:0 0 24px">${escapeHtml(body)}</p>
<p style="margin:0 0 24px;font-size:14px">${escapeHtml(note)}</p>
<p style="margin:0;font-size:14px">OPOS</p>
</div>
</body>
</html>
`
  return { subject, text, html }
}

/**
 * An email of an order, in the locale active on `i18n`: its parts in the order they are read, as
 * plain text and as plain HTML with the same content. Every value is escaped, since names and
 * addresses come from conventions and buyers. A picture is named by its content id: it travels
 * with the message.
 */
export function renderOrderEmail(i18n: I18n, content: OrderEmailContent): RenderedEmail {
  const said = (label: MessageDescriptor | string) =>
    typeof label === 'string' ? label : i18n._(label)
  const subject = i18n._(content.subject)

  const text = [
    ...content.parts.map((part): string => {
      switch (part.kind) {
        case 'paragraph':
          return i18n._(part.text)
        case 'heading':
          return i18n._(part.text).toLocaleUpperCase(i18n.locale)
        case 'rows':
          return part.rows.map((row) => `${said(row.label)}: ${row.value}`).join('\n')
        case 'link':
          return `${said(part.label)}: ${part.url}`
        case 'image':
          return `${i18n._(part.alt)}: ${part.caption}`
        case 'quote':
          return part.lines.join('\n')
      }
    }),
    'OPOS',
  ].join('\n\n')

  const body = content.parts
    .map((part): string => {
      switch (part.kind) {
        case 'paragraph':
          return `<p style="margin:0 0 24px">${escapeHtml(i18n._(part.text))}</p>`
        case 'heading':
          return `<h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(i18n._(part.text))}</h2>`
        case 'rows':
          return `<table role="presentation" style="width:100%;margin:0 0 24px;border-collapse:collapse">${part.rows
            .map((row) => {
              const weight = row.strong ? 'font-weight:bold;' : ''
              return `<tr><td style="${weight}padding:4px 8px 4px 0">${escapeHtml(said(row.label))}</td><td style="${weight}padding:4px 0;text-align:right;white-space:nowrap">${escapeHtml(row.value)}</td></tr>`
            })
            .join('')}</table>`
        case 'link': {
          const href = escapeHtml(part.url)
          return `<p style="margin:0 0 24px"><a href="${href}" style="color:#1a1a1a;font-weight:bold">${escapeHtml(said(part.label))}</a><br><span style="font-size:14px;word-break:break-all">${href}</span></p>`
        }
        case 'image':
          return `<p style="margin:0 0 24px"><img src="cid:${escapeHtml(part.cid)}" alt="${escapeHtml(i18n._(part.alt))}" width="240" height="240" style="display:block;margin:0 0 8px"><span style="font-family:monospace;font-size:14px;word-break:break-all">${escapeHtml(part.caption)}</span></p>`
        case 'quote':
          return `<p style="margin:0 0 24px;padding:0 0 0 12px;border-left:3px solid #1a1a1a">${part.lines.map(escapeHtml).join('<br>')}</p>`
      }
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="${escapeHtml(i18n.locale)}">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto">
${body}
<p style="margin:0;font-size:14px">OPOS</p>
</div>
</body>
</html>
`
  return { subject, text, html }
}
