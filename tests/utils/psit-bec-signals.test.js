import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignals,
  buildTimeline,
  buildVerdict,
  formatUtc,
  groupSignInsByIp,
  toUtc,
} from '../../src/utils/psit-bec-signals'

// The fixtures reproduce the case this module was written for: a mailbox whose upstream report
// came out "risque élevé" on 12 points, 9 of which were artefacts. Every expectation below is
// what should have been said about that data instead.
const userData = { id: 'user-guid', userPrincipalName: 'p.taieb@contoso.test', displayName: 'P T' }

const signIn = (overrides) => ({
  CreatedDateTime: '2026-08-20T06:49:00Z',
  IPAddress: '146.241.181.10',
  Country: 'IT',
  City: 'Sommacampagna',
  Status: 'Success',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: true,
  ...overrides,
})

const baseBecData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  NewRules: [
    {
      Name: 'fieldglass@fieldglass.net',
      MoveToFolder: 'CAP - DEMANDES',
      Description: "move the message to folder 'CAP - DEMANDES'",
    },
  ],
  InboxRuleChanges: [],
  SafelistChanges: [],
  SharingChanges: [],
  MailboxPermissionChanges: [],
  MFADevices: [{ displayName: 'iPhone 13 Pro', createdDateTime: '2024-06-19T09:21:00Z' }],
  ChangedPasswords: [{ userPrincipalName: 'a.bazzez@contoso.test', IsSuspectUser: false }],
  TrustedSenders: ['a@b.test'],
  BlockedSenders: ['spam@c.test'],
  MaliciousSPs: [],
  AddedApps: [],
  SuspectUserSignIns: [
    signIn({}),
    signIn({ CreatedDateTime: '2026-08-20T06:54:00Z', AppDisplayName: 'Office365 Shell WCSS-Server' }),
    signIn({ CreatedDateTime: '2026-08-18T20:42:00Z', City: 'Sacconago' }),
    signIn({ CreatedDateTime: '2026-08-17T02:00:00Z', IPAddress: '203.0.113.7', Country: 'CN', Status: 'Failed' }),
    signIn({ CreatedDateTime: '2026-08-17T02:05:00Z', IPAddress: '198.51.100.9', Country: 'IN', Status: 'Failed' }),
  ],
  SentMessageAnalysis: {
    TotalMessages: 177,
    AnalysableMessages: 11,
    SystemGeneratedMessages: 166,
    Bursts: [],
    RepeatedSubjects: [],
    FlaggedSubjectCount: 0,
    Flagged: false,
  },
  LocationAnalysis: { UsageLocation: 'FR' },
}

describe('toUtc / formatUtc', () => {
  it('normalises to UTC regardless of the input offset', () => {
    expect(toUtc('2026-08-20T08:49:00+02:00')).toBe('2026-08-20T06:49:00Z')
    expect(formatUtc('2026-08-20T08:49:00+02:00')).toBe('2026-08-20 06:49 UTC')
  })

  it('returns N/D rather than a fake date for unusable input', () => {
    expect(toUtc(null)).toBeNull()
    expect(toUtc('not a date')).toBeNull()
    expect(formatUtc(undefined)).toBe('N/D')
  })
})

describe('groupSignInsByIp', () => {
  it('collapses many events from one address into a single fact', () => {
    const groups = groupSignInsByIp(baseBecData.SuspectUserSignIns)
    const italian = groups.find((group) => group.ip === '146.241.181.10')

    expect(italian.successes).toBe(3)
    expect(italian.failures).toBe(0)
    expect(italian.cities).toEqual(expect.arrayContaining(['Sommacampagna', 'Sacconago']))
    expect(italian.firstSeenUtc).toBe('2026-08-18T20:42:00Z')
    expect(italian.lastSeenUtc).toBe('2026-08-20T06:54:00Z')
  })

  it('ranks the successful foreign address first, spray sources after', () => {
    const groups = groupSignInsByIp(baseBecData.SuspectUserSignIns)
    expect(groups[0].ip).toBe('146.241.181.10')
    expect(groups.slice(1).every((group) => group.successes === 0)).toBe(true)
  })
})

describe('buildSignals', () => {
  it('treats a filing rule as a question, not as a finding', () => {
    const signals = buildSignals(baseBecData, userData)
    const rule = signals.find((signal) => signal.id.startsWith('rule-filing:'))

    expect(rule.class).toBe(SIGNAL_CLASS.TO_QUALIFY)
    expect(rule.suggestion).toBe('expected')
    expect(rule.question).toContain('fonctionnement normal')
  })

  it('classes an externally forwarding rule as established without asking anyone', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        NewRules: [{ Name: 'copie', ForwardTo: '"X" [SMTP:attacker@evil.test]' }],
      },
      userData
    )
    const rule = signals.find((signal) => signal.id.startsWith('rule-exfil:'))

    expect(rule.class).toBe(SIGNAL_CLASS.ESTABLISHED)
    expect(rule.detail).toContain('attacker@evil.test')
    expect(rule.question).toBeUndefined()
  })

  it('does not treat a forward to the user own domain as exfiltration', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        NewRules: [{ Name: 'interne', ForwardTo: 'assistant@contoso.test' }],
      },
      userData
    )
    expect(signals.some((signal) => signal.id.startsWith('rule-exfil:'))).toBe(false)
  })

  it('raises one question per source address for successful foreign sign-ins', () => {
    const signals = buildSignals(baseBecData, userData)
    const signInSignals = signals.filter((signal) => signal.id.startsWith('signin-ip:'))

    expect(signInSignals).toHaveLength(1)
    expect(signInSignals[0].class).toBe(SIGNAL_CLASS.TO_QUALIFY)
    expect(signInSignals[0].title).toContain('3 connexion(s) réussie(s)')
    expect(signInSignals[0].question).toContain('VPN')
    expect(signInSignals[0].question).toContain('FR')
  })

  it('files failed attempts and service-generated mail as noise, kept visible', () => {
    const signals = buildSignals(baseBecData, userData)
    const noise = signals.filter((signal) => signal.class === SIGNAL_CLASS.NOISE)

    expect(noise.map((signal) => signal.id)).toEqual(
      expect.arrayContaining([
        'signin-failures',
        'mail-service-generated',
        'password-other-users',
        'safelist-unchanged',
      ])
    )
    expect(noise.find((signal) => signal.id === 'mail-service-generated').title).toContain('166')
  })

  it('flags a configuration change made from outside the usage location as established', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        InboxRuleChanges: [{ Operation: 'New-InboxRule', RuleName: 'x', ForeignLocation: true }],
      },
      userData
    )
    const change = signals.find((signal) => signal.id === 'config-change-foreign')
    expect(change.class).toBe(SIGNAL_CLASS.ESTABLISHED)
  })
})

describe('buildVerdict', () => {
  const signals = buildSignals(baseBecData, userData)

  it('states no risk level while a question is unanswered', () => {
    const verdict = buildVerdict(signals, [])

    expect(verdict.status).toBe(VERDICT_STATUS.TO_QUALIFY)
    expect(verdict.label).toBe('À qualifier')
    expect(verdict.openQuestions.length).toBeGreaterThan(0)
    // The whole point: no level is emitted, so nothing can be read as "élevé" or "faible".
    expect(verdict).not.toHaveProperty('level')
  })

  it('clears the case when every question is answered as expected', () => {
    const triage = signals
      .filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
      .map((signal) => ({ SignalId: signal.id, Verdict: 'expected', Analyst: 's.miro' }))

    const verdict = buildVerdict(signals, triage)
    expect(verdict.status).toBe(VERDICT_STATUS.CLEAN)
    expect(verdict.openQuestions).toHaveLength(0)
  })

  it('concludes to a compromise when the analyst calls one signal unexpected', () => {
    const target = signals.find((signal) => signal.id.startsWith('signin-ip:'))
    const triage = signals
      .filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
      .map((signal) => ({
        SignalId: signal.id,
        Verdict: signal.id === target.id ? 'unexpected' : 'expected',
        Analyst: 's.miro',
      }))

    const verdict = buildVerdict(signals, triage)
    expect(verdict.status).toBe(VERDICT_STATUS.COMPROMISED)
    expect(verdict.detail).toContain('connexion(s) réussie(s)')
  })

  it('stays open when a question could not be answered', () => {
    const triage = signals
      .filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
      .map((signal) => ({ SignalId: signal.id, Verdict: 'undetermined', Analyst: 's.miro' }))

    const verdict = buildVerdict(signals, triage)
    expect(verdict.status).toBe(VERDICT_STATUS.UNDETERMINED)
  })

  it('does not wait for anyone when a signal is established', () => {
    const withExfil = buildSignals(
      { ...baseBecData, NewRules: [{ Name: 'copie', RedirectTo: 'attacker@evil.test' }] },
      userData
    )
    const verdict = buildVerdict(withExfil, [])

    expect(verdict.status).toBe(VERDICT_STATUS.COMPROMISED)
    expect(verdict.established.length).toBeGreaterThan(0)
  })
})

describe('buildTimeline', () => {
  it('merges sources into one ascending UTC chronology', () => {
    const timeline = buildTimeline({
      ...baseBecData,
      InboxRuleChanges: [{ Date: '2026-08-19T05:00:00Z', Operation: 'New-InboxRule', RuleName: 'x' }],
      SentMessageAnalysis: {
        ...baseBecData.SentMessageAnalysis,
        Bursts: [{ WindowStart: '2026-08-19T07:10:00Z', MessageCount: 10, RecipientCount: 17 }],
      },
    })

    const stamps = timeline.map((event) => event.timestampUtc)
    expect(stamps).toEqual([...stamps].sort())
    expect(timeline.map((event) => event.kind)).toEqual(
      expect.arrayContaining(['signin', 'rule', 'mail'])
    )
    // Failed sign-ins are not events in a chronology of what happened.
    expect(timeline.every((event) => !event.label.includes('203.0.113.7'))).toBe(true)
  })
})
