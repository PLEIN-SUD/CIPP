import { readAppScopes } from '../../src/utils/psit-soc-app-scopes'

// The scope reading is what turns "an application was consented" into a decision. These pin the
// discriminants of a consent-phishing grant: mailbox access, and the refresh token that makes it
// survive the password reset.

describe('readAppScopes', () => {
  it('splits a scope string however the API joined it', () => {
    expect(readAppScopes('User.Read,Mail.Read offline_access').granted).toEqual([
      'User.Read',
      'Mail.Read',
      'offline_access',
    ])
  })

  it('flags mailbox access as risky, with the reason the analyst reads', () => {
    const read = readAppScopes('User.Read Mail.ReadWrite')

    expect(read.risky.map((entry) => entry.scope)).toEqual(['Mail.ReadWrite'])
    expect(read.risky[0].why).toMatch(/écriture ou envoi/)
    expect(read.readOnly).toBe(false)
  })

  it('reports the refresh token separately: it is what survives a password reset', () => {
    expect(readAppScopes('Mail.Read offline_access').hasPersistence).toBe(true)
    expect(readAppScopes('Mail.Read').hasPersistence).toBe(false)
  })

  it('flags the Exchange and directory scopes a persistence grant uses', () => {
    expect(readAppScopes('EWS.AccessAsUser.All').risky).toHaveLength(1)
    expect(readAppScopes('full_access_as_app').risky).toHaveLength(1)
    expect(readAppScopes('MailboxSettings.ReadWrite').risky).toHaveLength(1)
    expect(readAppScopes('Directory.ReadWrite.All').risky).toHaveLength(1)
  })

  it('calls a genuinely harmless grant read-only', () => {
    const read = readAppScopes('User.Read profile openid')
    expect(read.readOnly).toBe(true)
    expect(read.risky).toHaveLength(0)
  })

  it('never calls an unreadable grant read-only: no scope means no information', () => {
    // "We could not read the consent" and "the app can do nothing" must not look the same.
    expect(readAppScopes('').readOnly).toBe(false)
    expect(readAppScopes(null).readOnly).toBe(false)
    expect(readAppScopes(undefined).granted).toEqual([])
  })
})
