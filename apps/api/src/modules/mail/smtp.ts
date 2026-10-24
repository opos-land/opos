import { type SMTPTransportOptions } from 'nodemailer'
import { type Env } from '../../config/env'

type SmtpEnv = Pick<Env, 'NODE_ENV' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS'>

/** The SMTP connection settings: implicit TLS on 465, mandatory STARTTLS on any other port. */
export function smtpOptions(env: SmtpEnv): SMTPTransportOptions {
  const secure = env.SMTP_PORT === 465
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    // Credentials and message bodies (which carry one-time links) never travel in cleartext. Only a
    // server without credentials outside production, Mailpit in dev and the tests, takes plaintext.
    requireTLS: !secure && (env.SMTP_USER !== '' || env.NODE_ENV === 'production'),
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Supabase Auth waits a few seconds for the send-email hook; a stuck server fails first.
    connectionTimeout: 3_000,
    greetingTimeout: 3_000,
    socketTimeout: 4_000,
  }
}
