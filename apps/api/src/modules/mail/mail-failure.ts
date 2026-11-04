/**
 * What a log line may say about a failed send: the error's class, nodemailer's `code` and
 * `responseCode`. Its message carries the SMTP server's reply, which commonly quotes the recipient.
 */
export function mailFailure(error: unknown): string {
  const { code, responseCode } = Object(error) as { code?: unknown; responseCode?: unknown }
  const name = error instanceof Error ? error.name : 'unknown failure'
  const smtpCode = typeof code === 'string' ? code : 'none'
  const response = typeof responseCode === 'number' ? responseCode : 'none'
  return `${name}, code ${smtpCode}, response ${response}`
}
