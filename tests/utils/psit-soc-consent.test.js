import { psitSocOffHours, readConsentGrants, readConsentAudit } from '../../src/utils/psit-soc-consent'

// These readings sit under the guide step that used to send the analyst to the Entra portal.
// What is pinned: off-hours is judged in Paris time and refuses to answer on an unreadable date,
// a consent row names who it covers, and the audit match holds on either the principal id or the
// display name since Graph cannot filter on the target server-side.

describe('off hours, Paris time', () => {
  it('reads a summer UTC timestamp through the Paris offset', () => {
    // 17:30 UTC in August is 19:30 in Paris: off hours, though the UTC hour says otherwise.
    expect(psitSocOffHours('2026-08-26T17:30:00Z')).toBe(true)
    expect(psitSocOffHours('2026-08-26T15:00:00Z')).toBe(false)
  })

  it('counts the weekend as off hours whatever the time', () => {
    expect(psitSocOffHours('2026-08-29T10:00:00Z')).toBe(true)
  })

  it('answers null, not false, when the date cannot be read', () => {
    // "We could not tell" and "during hours" are different answers under a step about HNO.
    expect(psitSocOffHours('pas une date')).toBeNull()
    expect(psitSocOffHours(null)).toBeNull()
  })
})

describe('consent rows', () => {
  const grants = [
    { consentType: 'AllPrincipals', principalId: null, scope: 'User.Read Mail.ReadWrite' },
    { consentType: 'Principal', principalId: 'u1', scope: 'openid profile' },
    { consentType: 'Principal', principalId: 'u2', scope: 'openid' },
  ]
  const users = [{ id: 'u1', userPrincipalName: 'p.durand@contoso.test' }]

  it('names the admin consent as covering the whole organisation', () => {
    const rows = readConsentGrants(grants, users)
    expect(rows[0].kind).toBe('admin')
    expect(rows[0].who).toMatch(/Toute l’organisation/)
    // The risk reading applies per consent: this one carries the mailbox write.
    expect(rows[0].risky.map((entry) => entry.scope)).toContain('Mail.ReadWrite')
  })

  it('resolves the user a consent covers, and keeps the id when it cannot', () => {
    const rows = readConsentGrants(grants, users)
    expect(rows[1].who).toBe('p.durand@contoso.test')
    // u2 resolves to nobody: the id stays on display, searchable, rather than an anonymous row.
    expect(rows[2].who).toBe('u2')
  })
})

describe('consent audit trail', () => {
  const rows = [
    {
      activityDateTime: '2026-08-17T20:10:00Z',
      result: 'success',
      initiatedBy: { user: { userPrincipalName: 'p.durand@contoso.test', ipAddress: '203.0.113.9' } },
      targetResources: [{ id: 'SP-1', displayName: 'To-do Checklist for Team' }],
    },
    {
      activityDateTime: '2026-08-18T09:00:00Z',
      result: 'success',
      initiatedBy: { user: { userPrincipalName: 'autre@contoso.test' } },
      targetResources: [{ id: 'sp-1', displayName: 'To-do Checklist for Team' }],
    },
    {
      activityDateTime: '2026-08-19T09:00:00Z',
      result: 'success',
      initiatedBy: { user: { userPrincipalName: 'x@contoso.test' } },
      targetResources: [{ id: 'sp-other', displayName: 'Une autre application' }],
    },
  ]

  it('keeps only the events aimed at this application, id case-insensitive', () => {
    const events = readConsentAudit(rows, { servicePrincipalId: 'sp-1' })
    expect(events).toHaveLength(2)
    expect(events.map((event) => event.who)).not.toContain('x@contoso.test')
  })

  it('says who, from where, and whether the instant reads as off-hours', () => {
    const events = readConsentAudit(rows, { servicePrincipalId: 'sp-1' })
    const evening = events.find((event) => event.who === 'p.durand@contoso.test')
    expect(evening.ip).toBe('203.0.113.9')
    // 20:10 UTC in August is 22:10 in Paris.
    expect(evening.offHours).toBe(true)
    expect(events[0].whenUtc > events[1].whenUtc).toBe(true)
  })

  it('matches on the display name when no id is known', () => {
    const events = readConsentAudit(rows, { appDisplayName: 'To-do Checklist for Team' })
    expect(events).toHaveLength(2)
  })
})
