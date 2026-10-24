import { type AddressInfo, createServer, type Server } from 'node:net'
import { createTransport } from 'nodemailer'
import { afterEach, describe, expect, it } from 'vitest'
import { sendWithDeadline, smtpOptions } from './smtp'

const mailpit = {
  NODE_ENV: 'development',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_USER: '',
  SMTP_PASS: '',
} as const

/**
 * An SMTP server that offers AUTH but no STARTTLS, records every command it receives and answers
 * each one after `replyDelayMs`.
 */
async function plaintextServer(replyDelayMs = 0) {
  const commands: string[] = []
  const state = { closed: false }
  const server = createServer((socket) => {
    const reply = (text: string, end = false) =>
      setTimeout(() => {
        if (socket.writable) {
          if (end) socket.end(text)
          else socket.write(text)
        }
      }, replyDelayMs)
    let inData = false
    socket.write('220 fake ESMTP\r\n')
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let end
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            commands.push('<message>')
            reply('250 queued\r\n')
          }
          continue
        }
        commands.push(line)
        const verb = line.split(' ')[0]?.toUpperCase()
        if (verb === 'EHLO') reply('250-fake\r\n250 AUTH PLAIN LOGIN\r\n')
        else if (verb === 'STARTTLS') reply('502 command not implemented\r\n')
        else if (verb === 'DATA') {
          inData = true
          reply('354 go ahead\r\n')
        } else if (verb === 'QUIT') reply('221 bye\r\n', true)
        else reply('250 ok\r\n')
      }
    })
    socket.on('error', () => undefined)
    socket.on('close', () => {
      state.closed = true
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return { port: (server.address() as AddressInfo).port, commands, state }
}

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((resolve) => s.close(() => resolve(undefined)))),
  )
})

const message = { to: 'someone@example.test', subject: 'Hi', text: 'A one-time link' }

describe('smtpOptions', () => {
  it('lets Mailpit in dev take plaintext', () => {
    expect(smtpOptions(mailpit)).toMatchObject({ secure: false, requireTLS: false })
  })

  it('requires STARTTLS once there are credentials', () => {
    const options = smtpOptions({ ...mailpit, SMTP_PORT: 587, SMTP_USER: 'u', SMTP_PASS: 'p' })

    expect(options).toMatchObject({ secure: false, requireTLS: true })
  })

  it('requires STARTTLS in production even without credentials', () => {
    expect(smtpOptions({ ...mailpit, NODE_ENV: 'production', SMTP_PORT: 25 })).toMatchObject({
      secure: false,
      requireTLS: true,
    })
  })

  it('uses implicit TLS on port 465', () => {
    expect(smtpOptions({ ...mailpit, NODE_ENV: 'production', SMTP_PORT: 465 })).toMatchObject({
      secure: true,
      requireTLS: false,
    })
  })

  it('refuses a server without STARTTLS before sending credentials or the message', async () => {
    const server = await plaintextServer()
    const transport = createTransport(
      smtpOptions({ ...mailpit, SMTP_HOST: '127.0.0.1', SMTP_PORT: server.port, SMTP_USER: 'u' }),
      { from: 'opos@example.test' },
    )

    await expect(transport.sendMail(message)).rejects.toThrow()
    expect(server.commands).toContain('STARTTLS')
    expect(server.commands.some((c) => /^AUTH/i.test(c))).toBe(false)
    expect(server.commands).not.toContain('<message>')
  })

  it('sends in plaintext to a server without credentials outside production', async () => {
    const server = await plaintextServer()
    const transport = createTransport(
      smtpOptions({ ...mailpit, SMTP_HOST: '127.0.0.1', SMTP_PORT: server.port }),
      { from: 'opos@example.test' },
    )

    await transport.sendMail(message)
    expect(server.commands).toContain('<message>')
  })
})

describe('sendWithDeadline', () => {
  const options = (port: number) =>
    smtpOptions({ ...mailpit, SMTP_HOST: '127.0.0.1', SMTP_PORT: port })

  it('delivers the message', async () => {
    const server = await plaintextServer()

    await sendWithDeadline(options(server.port), 'opos@example.test', message)

    expect(server.commands).toContain('MAIL FROM:<opos@example.test>')
    expect(server.commands).toContain('<message>')
  })

  it('gives up at the deadline on a server that answers every step in time but slowly', async () => {
    // Every reply comes well within socketTimeout, so only the overall deadline stops the send.
    const server = await plaintextServer(300)
    const started = Date.now()

    await expect(
      sendWithDeadline(options(server.port), 'opos@example.test', message, 800),
    ).rejects.toThrow(/within 800 ms/)

    expect(Date.now() - started).toBeLessThan(1_000)
    await expect.poll(() => server.state.closed).toBe(true)
    expect(server.commands).not.toContain('DATA')
    expect(server.commands).not.toContain('<message>')
  })

  it('rejects when the server refuses the connection', async () => {
    await expect(sendWithDeadline(options(1), 'opos@example.test', message)).rejects.toThrow(
      /ECONNREFUSED/,
    )
  })
})
