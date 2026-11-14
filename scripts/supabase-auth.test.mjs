import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

// supabase/config.toml sets Supabase Auth for the local stack; infra/modules/supabase/auth.json
// sets the same for a deployed project, under the names of the Management API. A setting changed
// in one and not in the other would make Dev behave unlike the stack the tests run against.

const root = new URL('../', import.meta.url)

/** The scalar settings of config.toml, by their dotted path; arrays and comments are skipped. */
function readToml(text) {
  const settings = {}
  let section = ''
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      section = header[1]
      continue
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line)
    if (!pair || pair[2].startsWith('[')) continue
    settings[`${section}.${pair[1]}`] = JSON.parse(pair[2])
  }
  return settings
}

const config = readToml(readFileSync(new URL('supabase/config.toml', root), 'utf8'))
const auth = JSON.parse(readFileSync(new URL('infra/modules/supabase/auth.json', root), 'utf8'))

const not = (value) => !value

// Each Auth setting of config.toml, with its name in auth.json and how its value reads there
const mapping = {
  'auth.jwt_expiry': ['jwt_exp'],
  'auth.enable_refresh_token_rotation': ['refresh_token_rotation_enabled'],
  'auth.refresh_token_reuse_interval': ['security_refresh_token_reuse_interval'],
  'auth.enable_signup': ['disable_signup', not],
  'auth.enable_anonymous_sign_ins': ['external_anonymous_users_enabled'],
  'auth.enable_manual_linking': ['security_manual_linking_enabled'],
  'auth.minimum_password_length': ['password_min_length'],
  'auth.email.enable_signup': ['external_email_enabled'],
  'auth.email.enable_confirmations': ['mailer_autoconfirm', not],
  'auth.email.double_confirm_changes': ['mailer_secure_email_change_enabled'],
  'auth.email.otp_expiry': ['mailer_otp_exp'],
  'auth.sms.enable_signup': ['external_phone_enabled'],
  'auth.hook.send_email.enabled': ['hook_send_email_enabled'],
  'auth.external.google.enabled': ['external_google_enabled'],
  'auth.mfa.max_enrolled_factors': ['mfa_max_enrolled_factors'],
  'auth.mfa.totp.enroll_enabled': ['mfa_totp_enroll_enabled'],
  'auth.mfa.totp.verify_enabled': ['mfa_totp_verify_enabled'],
  'auth.mfa.phone.enroll_enabled': ['mfa_phone_enroll_enabled'],
  'auth.mfa.phone.verify_enabled': ['mfa_phone_verify_enabled'],
  'auth.mfa.web_authn.enroll_enabled': ['mfa_web_authn_enroll_enabled'],
  'auth.mfa.web_authn.verify_enabled': ['mfa_web_authn_verify_enabled'],
}

// Settings of the local stack alone: addresses and secrets the module sets per environment, the
// local signing key, and the limits the tests need
const localOnly = [
  'auth.enabled',
  'auth.site_url',
  'auth.signing_keys_path',
  'auth.rate_limit.sign_in_sign_ups',
  'auth.rate_limit.token_verifications',
  'auth.rate_limit.token_refresh',
  'auth.hook.send_email.uri',
  'auth.hook.send_email.secrets',
  'auth.external.google.client_id',
  'auth.external.google.secret',
]

// Settings of a deployed project alone: the stack runs behind no proxy
const deployedOnly = ['security_sb_forwarded_for_enabled']

describe('the Auth settings of a deployed project', () => {
  it('give every Auth setting of config.toml the same value', () => {
    for (const [path, [name, read = (value) => value]] of Object.entries(mapping)) {
      assert.ok(path in config, `config.toml no longer sets ${path}`)
      assert.equal(auth[name], read(config[path]), `${name} differs from ${path}`)
    }
  })

  it('leave no Auth setting of config.toml unmapped', () => {
    const unmapped = Object.keys(config).filter(
      (path) => path.startsWith('auth.') && !(path in mapping) && !localOnly.includes(path),
    )
    assert.deepEqual(unmapped, [], 'map each in scripts/supabase-auth.test.mjs and auth.json')
  })

  it('set nothing config.toml does not, but what only a deployed project needs', () => {
    const mapped = Object.values(mapping).map(([name]) => name)
    const extra = Object.keys(auth).filter((name) => !mapped.includes(name))
    assert.deepEqual(extra, deployedOnly)
  })
})
