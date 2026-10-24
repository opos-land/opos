import { type AddressInfo, createServer, type Server } from 'node:net'
import { createTransport } from 'nodemailer'
import { afterEach, describe, expect, it } from 'vitest'
import { smtpOptions } from './smtp'

const mailpit = {
  NODE_ENV: 'development',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 1025,
  SMTP_USER: '',
  SMTP_PASS: '',
} as const

/** An SMTP server that offers AUTH but no STARTTLS, and records every command it receives. */
async function plaintextServer() {
  const commands: string[] = []
  const server = createServer((socket) => {
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
            socket.write('250 queued\r\n')
          }
          continue
        }
        commands.push(line)
        const verb = line.split(' ')[0]?.toUpperCase()
        if (verb === 'EHLO') socket.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n')
        else if (verb === 'STARTTLS') socket.write('502 command not implemented\r\n')
        else if (verb === 'DATA') {
          inData = true
          socket.write('354 go ahead\r\n')
        } else if (verb === 'QUIT') socket.end('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return { port: (server.address() as AddressInfo).port, commands }
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
