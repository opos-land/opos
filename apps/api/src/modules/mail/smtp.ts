import { connect } from 'node:net'
import { createTransport, type SendMailOptions, type SMTPTransportOptions } from 'nodemailer'
import { type Env } from '../../config/env'

/**
 * How long one send may take in total. Supabase Auth waits 5 s for the send-email hook and does not
 * retry, so the hook has to answer before that, and a message it gave up on must not go out later.
 */
export const SEND_DEADLINE_MS = 4_000

type SmtpEnv = Pick<Env, 'NODE_ENV' | 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS'>

export type SmtpOptions = SMTPTransportOptions & { host: string; port: number }

/** The SMTP connection settings: implicit TLS on 465, mandatory STARTTLS on any other port. */
export function smtpOptions(env: SmtpEnv): SmtpOptions {
  const secure = env.SMTP_PORT === 465
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure,
    // Credentials and message bodies (which carry one-time links) never travel in cleartext. Only a
    // server without credentials outside production, Mailpit in dev and the tests, takes plaintext.
    requireTLS: !secure && (env.SMTP_USER !== '' || env.NODE_ENV === 'production'),
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Connecting, the greeting and the TLS setup share one budget; every later reply gets its own.
    // Both stay below the deadline, so a single stuck step reports its own error.
    connectionTimeout: 2_000,
    socketTimeout: 2_000,
  }
}

/**
 * Sends one message on a connection of its own and destroys that connection when `deadlineMs`
 * passes. The promise settles by the deadline, and a message the server has not accepted by then
 * is never delivered.
 */
export async function sendWithDeadline(
  options: SmtpOptions,
  from: string,
  message: SendMailOptions,
  deadlineMs = SEND_DEADLINE_MS,
) {
  let expired = false
  let socket: ReturnType<typeof connect> | undefined

  const transport = createTransport(
    {
      ...options,
      getSocket: (_options, callback) => {
        const opened = connect({ host: options.host, port: options.port })
        socket = opened
        let handedOver = false
        // nodemailer listens for errors once it owns the socket; this keeps a late error on the
        // plain socket under TLS from crashing the process.
        opened.on('error', (error) => {
          if (!handedOver) {
            handedOver = true
            callback(error)
          }
        })
        opened.once('close', () => {
          if (!handedOver) {
            handedOver = true
            callback(new Error('SMTP connection closed before it was established'))
          }
        })
        opened.once('connect', () => {
          if (expired) {
            opened.destroy()
            return
          }
          handedOver = true
          callback(null, { connection: opened })
        })
      },
    },
    { from },
  )

  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      expired = true
      socket?.destroy()
      reject(new Error(`SMTP send did not finish within ${deadlineMs} ms`))
    }, deadlineMs)
  })
  const sending = transport.sendMail(message)
  // Whichever loses the race still settles; its outcome is not needed.
  sending.catch(() => undefined)

  try {
    return await Promise.race([sending, deadline])
  } finally {
    clearTimeout(timer)
    transport.close()
  }
}
