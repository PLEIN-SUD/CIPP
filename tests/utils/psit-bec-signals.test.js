import {
  SIGNAL_CLASS,
  VERDICT_STATUS,
  buildSignInSessions,
  buildSignals,
  buildTimeline,
  buildVerdict,
  partitionDeterminations,
  classifySentMessages,
  firstUnauthorisedAccessUtc,
  formatUtc,
  getAnalysisWindow,
  groupSignInsByIp,
  isServiceIp,
  toUtc,
} from '../../src/utils/psit-bec-signals'

// The fixtures reproduce the case this module was written for: a mailbox whose upstream report
// came out "risque élevé" on 12 points, 9 of which were artefacts. Every expectation below is
// what should have been said about that data instead.
const userData = { id: 'user-guid', userPrincipalName: 'p.martin@contoso.test', displayName: 'P T' }

const signIn = (overrides) => ({
  CreatedDateTime: '2026-08-20T06:49:00Z',
  IPAddress: '203.0.113.42',
  Country: 'IT',
  City: 'Vérone',
  Status: 'Success',
  AppDisplayName: 'Microsoft Graph',
  ForeignLocation: true,
  ...overrides,
})

const baseBecData = {
  ExtractedAt: '2026-08-20T10:32:00Z',
  NewRules: [
    {
      Name: 'classement@classement.test',
      MoveToFolder: 'DOSSIERS',
      Description: "move the message to folder 'DOSSIERS'",
    },
  ],
  InboxRuleChanges: [],
  SafelistChanges: [],
  SharingChanges: [],
  MailboxPermissionChanges: [],
  MFADevices: [{ displayName: 'iPhone 13 Pro', createdDateTime: '2024-06-19T09:21:00Z' }],
  ChangedPasswords: [{ userPrincipalName: 'a.durand@contoso.test', IsSuspectUser: false }],
  TrustedSenders: ['a@b.test'],
  BlockedSenders: ['spam@c.test'],
  MaliciousSPs: [],
  AddedApps: [],
  SuspectUserSignIns: [
    signIn({}),
    signIn({
      CreatedDateTime: '2026-08-20T06:54:00Z',
      AppDisplayName: 'Office365 Shell WCSS-Server',
    }),
    signIn({ CreatedDateTime: '2026-08-18T20:42:00Z', City: 'Sacconago' }),
    signIn({
      CreatedDateTime: '2026-08-17T02:00:00Z',
      IPAddress: '203.0.113.7',
      Country: 'CN',
      Status: 'Failed',
    }),
    signIn({
      CreatedDateTime: '2026-08-17T02:05:00Z',
      IPAddress: '198.51.100.9',
      Country: 'IN',
      Status: 'Failed',
    }),
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
    const italian = groups.find((group) => group.ip === '203.0.113.42')

    expect(italian.successes).toBe(3)
    expect(italian.failures).toBe(0)
    expect(italian.cities).toEqual(expect.arrayContaining(['Vérone', 'Sacconago']))
    expect(italian.firstSeenUtc).toBe('2026-08-18T20:42:00Z')
    expect(italian.lastSeenUtc).toBe('2026-08-20T06:54:00Z')
  })

  it('ranks the successful foreign address first, spray sources after', () => {
    const groups = groupSignInsByIp(baseBecData.SuspectUserSignIns)
    expect(groups[0].ip).toBe('203.0.113.42')
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
    expect(signInSignals[0].title).toContain('3 connexions réussies')
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

  // The case that produced this rule: PerfectData Software, consented in April 2024, read as
  // evidence of an August 2026 compromise. It is a real exposure and it is not this incident.
  it('keeps a catalog application older than the window out of the verdict', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        MaliciousSPs: [
          {
            displayName: 'PERFECTDATA SOFTWARE',
            appId: 'ff8d92dc-3d82-41d6-bcbd-b9174d163620',
            createdDateTime: '2024-04-21T11:03:06Z',
            CatalogName: 'PerfectData Software',
          },
        ],
      },
      userData
    )

    expect(signals.some((signal) => signal.id === 'app-malicious')).toBe(false)
    const preexisting = signals.find((signal) => signal.id === 'app-malicious-preexisting')
    expect(preexisting.class).toBe(SIGNAL_CLASS.NOISE)
    expect(preexisting.detail).toContain('21 avril 2024')
    // Kept as something to do, not filed as harmless.
    expect(preexisting.detail).toContain('supprimer')
    expect(buildVerdict(signals, []).status).toBe(VERDICT_STATUS.TO_QUALIFY)
  })

  it('classes a catalog application that appeared during the window as established', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        MaliciousSPs: [
          {
            displayName: 'PERFECTDATA SOFTWARE',
            appId: 'ff8d92dc-3d82-41d6-bcbd-b9174d163620',
            createdDateTime: '2026-08-18T09:12:00Z',
            CatalogName: 'PerfectData Software',
          },
        ],
        AddedApps: [
          {
            displayName: 'PERFECTDATA SOFTWARE',
            appId: 'ff8d92dc-3d82-41d6-bcbd-b9174d163620',
            createdDateTime: '2026-08-18T09:12:00Z',
            MaliciousMatch: { Name: 'PerfectData Software' },
          },
        ],
      },
      userData
    )

    const established = signals.filter((signal) => signal.id === 'app-malicious')
    expect(established).toHaveLength(1)
    expect(established[0].class).toBe(SIGNAL_CLASS.ESTABLISHED)
    // Present in both collections, counted once.
    expect(established[0].detail).toContain('PERFECTDATA SOFTWARE')
    expect(established[0].title).toContain('1 application')
    expect(signals.some((signal) => signal.id === 'app-malicious-preexisting')).toBe(false)
    expect(buildVerdict(signals, []).status).toBe(VERDICT_STATUS.COMPROMISED)
  })

  it('turns a catalog application with no creation date into a question', () => {
    const signals = buildSignals(
      {
        ...baseBecData,
        MaliciousSPs: [{ displayName: 'eM Client', appId: 'e9a7fea1-1cc0-4cd9-a31b-9137ca5deee6' }],
      },
      userData
    )
    const undated = signals.find((signal) =>
      signal.id.startsWith('app-malicious-undated:e9a7fea1')
    )

    expect(undated.class).toBe(SIGNAL_CLASS.TO_QUALIFY)
    expect(undated.question).toContain('Entra')
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
      .map((signal) => ({ SignalId: signal.id, Verdict: 'expected', Analyst: 'analyste' }))

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
        Analyst: 'analyste',
      }))

    const verdict = buildVerdict(signals, triage)
    expect(verdict.status).toBe(VERDICT_STATUS.COMPROMISED)
    expect(verdict.detail).toContain('connexions réussies')
  })

  it('stays open when a question could not be answered', () => {
    const triage = signals
      .filter((signal) => signal.class === SIGNAL_CLASS.TO_QUALIFY)
      .map((signal) => ({ SignalId: signal.id, Verdict: 'undetermined', Analyst: 'analyste' }))

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

describe('getAnalysisWindow', () => {
  it('bounds the window on the extraction date', () => {
    const window = getAnalysisWindow({ ExtractedAt: '2026-08-20T10:00:00Z' })
    expect(window.endUtc).toBe('2026-08-20T10:00:00Z')
    expect(window.startUtc).toBe('2026-08-13T10:00:00Z')
    expect(window.days).toBe(7)
    // The 7 was assumed, not read: both reports print the window as a fact, so they need to know.
    expect(window.daysDeclared).toBe(false)
  })

  it('reads the length from the collection rather than assuming seven days', () => {
    const window = getAnalysisWindow({
      ExtractedAt: '2026-08-20T10:00:00Z',
      AnalysisWindowDays: 30,
    })
    expect(window.days).toBe(30)
    expect(window.daysDeclared).toBe(true)
    expect(window.startUtc).toBe('2026-07-21T10:00:00Z')
  })

  it('ignores a nonsensical declared length instead of inverting the window', () => {
    expect(
      getAnalysisWindow({ ExtractedAt: '2026-08-20T10:00:00Z', AnalysisWindowDays: 0 }).days
    ).toBe(7)
    expect(
      getAnalysisWindow({ ExtractedAt: '2026-08-20T10:00:00Z', AnalysisWindowDays: 'six' }).days
    ).toBe(7)
  })
})

describe('isServiceIp', () => {
  it('recognises the Exchange Online submission addresses', () => {
    expect(isServiceIp('2603:10a6:803:81::32')).toBe(true)
    expect(isServiceIp('[2603:10a6:803:81::32]')).toBe(true)
    expect(isServiceIp('40.107.13.25')).toBe(true)
    expect(isServiceIp('104.47.55.138')).toBe(true)
  })

  it('leaves user addresses and neighbouring ranges alone', () => {
    expect(isServiceIp('198.51.100.7')).toBe(false)
    expect(isServiceIp('203.0.113.42')).toBe(false)
    expect(isServiceIp('2603:2000::1')).toBe(false)
    expect(isServiceIp('40.94.0.1')).toBe(false)
    expect(isServiceIp('')).toBe(false)
    expect(isServiceIp(null)).toBe(false)
  })
})

describe('classifySentMessages', () => {
  // The collection that produced the first real PDFs predates the API-side classification, so the
  // rows carry no flags at all. Deriving them locally is what keeps a report from claiming that 166
  // automatic replies were mail sent from abroad.
  const becData = {
    SentMessages: [
      {
        Subject: 'Réponse automatique : absence',
        RecipientAddress: 'news@vendor.test',
        FromIP: '2603:10a6:803:81::32',
        ForeignLocation: true,
      },
      {
        Subject: 'Automatic reply: out of office',
        RecipientAddress: 'x@vendor.test',
        FromIP: '2603:10a6:803:81::32',
        ForeignLocation: true,
      },
      {
        Subject: 'Re: réunion projet',
        RecipientAddress: 'colleague@contoso.test',
        FromIP: '198.51.100.7',
        ForeignLocation: false,
      },
      {
        Subject: 'Fwd: consultation',
        RecipientAddress: 'buyer@client.test',
        FromIP: '198.51.100.7',
        ForeignLocation: false,
      },
      {
        Subject: 'Facture',
        RecipientAddress: 'victim@client.test',
        FromIP: '203.0.113.7',
        ForeignLocation: true,
      },
    ],
    SentMessageAnalysis: { TotalRecipients: 241, TotalMessages: 177 },
  }

  it('derives the classification when the collection carries no flags', () => {
    const mail = classifySentMessages(becData, userData)
    expect(mail.derivedLocally).toBe(true)
    expect(mail.counts.systemGenerated).toBe(2)
    expect(mail.counts.serviceIp).toBe(2)
    expect(mail.counts.internal).toBe(1)
    expect(mail.counts.humanExternal).toBe(2)
  })

  it('counts foreign sending only for human, external mail from a non-Microsoft address', () => {
    const mail = classifySentMessages(becData, userData)
    expect(mail.foreignHumanExternal).toHaveLength(1)
    expect(mail.foreignHumanExternal[0].RecipientAddress).toBe('victim@client.test')
  })

  it('trusts the API flags when they are present', () => {
    const mail = classifySentMessages(
      {
        SentMessages: [
          {
            Subject: 'anything',
            RecipientAddress: 'x@client.test',
            SystemGenerated: true,
            Internal: false,
            ServiceIp: true,
          },
        ],
      },
      userData
    )
    expect(mail.derivedLocally).toBe(false)
    expect(mail.counts.systemGenerated).toBe(1)
  })
})

describe('buildSignInSessions', () => {
  it('collapses consecutive sign-ins from one address into a session', () => {
    const sessions = buildSignInSessions([
      signIn({ CreatedDateTime: '2026-08-20T06:49:00Z' }),
      signIn({ CreatedDateTime: '2026-08-20T06:51:00Z', AppDisplayName: 'Exchange Online' }),
      signIn({ CreatedDateTime: '2026-08-20T06:54:00Z' }),
      // Two days earlier: a separate session.
      signIn({ CreatedDateTime: '2026-08-18T20:42:00Z' }),
    ])

    expect(sessions).toHaveLength(2)
    const morning = sessions.find((session) => session.startUtc === '2026-08-20T06:49:00Z')
    expect(morning.count).toBe(3)
    expect(morning.endUtc).toBe('2026-08-20T06:54:00Z')
    expect(morning.apps).toContain('Exchange Online')
  })

  it('ignores failed attempts: a session is access, not noise', () => {
    const sessions = buildSignInSessions([signIn({ Status: 'Failed', IPAddress: '203.0.113.7' })])
    expect(sessions).toHaveLength(0)
  })
})

describe('firstUnauthorisedAccessUtc', () => {
  it('takes the earliest sign-in of a retained address, not the first timeline row', () => {
    const signals = buildSignals(baseBecData, userData)
    const target = signals.find((signal) => signal.id.startsWith('signin-ip:'))
    const stamp = firstUnauthorisedAccessUtc(baseBecData, signals, [
      { SignalId: target.id, Verdict: 'unexpected', Analyst: 'analyste' },
    ])
    expect(stamp).toBe('2026-08-18T20:42:00Z')
  })

  it('returns null when no sign-in signal is retained, rather than guessing', () => {
    const signals = buildSignals(baseBecData, userData)
    expect(firstUnauthorisedAccessUtc(baseBecData, signals, [])).toBeNull()
  })
})

describe('buildTimeline', () => {
  it('aggregates sign-ins into sessions and keeps out-of-window items apart', () => {
    const timeline = buildTimeline({
      ...baseBecData,
      // Registered years before the window: context, never an event of this incident.
      MFADevices: [{ displayName: 'iPhone', createdDateTime: '2021-03-12T20:03:00Z' }],
      InboxRuleChanges: [
        { Date: '2026-08-19T05:00:00Z', Operation: 'New-InboxRule', RuleName: 'x' },
      ],
      SentMessageAnalysis: {
        ...baseBecData.SentMessageAnalysis,
        Bursts: [{ WindowStart: '2026-08-19T07:10:00Z', MessageCount: 10, RecipientCount: 17 }],
      },
    })

    const stamps = timeline.map((event) => event.timestampUtc)
    expect(stamps).toEqual([...stamps].sort())
    expect(timeline.every((event) => event.timestampUtc >= timeline.window.startUtc)).toBe(true)
    expect(timeline.context.map((event) => event.timestampUtc)).toContain('2021-03-12T20:03:00Z')
    // One session per address rather than one line per request.
    expect(timeline.filter((event) => event.kind === 'signin')).toHaveLength(2)
    expect(timeline.some((event) => event.label.includes('Session depuis 203.0.113.42'))).toBe(true)
  })
})

describe('partitionDeterminations', () => {
  const becData = { ExtractedAt: '2026-11-02T10:00:00Z', AnalysisWindowDays: 7 }

  it('keeps an answer given during the window', () => {
    const { current, stale } = partitionDeterminations(
      [
        {
          SignalId: 'signin-ip:203.0.113.42',
          Verdict: 'expected',
          DecidedUtc: '2026-10-30T08:00:00Z',
        },
      ],
      becData
    )
    expect(current).toHaveLength(1)
    expect(stale).toHaveLength(0)
  })

  it('files an answer older than the window as history, not as a verdict', () => {
    // The trap this exists for: the same address returns in November and inherits the answer given
    // in August, which files a fresh signal as noise without anyone being asked.
    const { current, stale, windowStartUtc } = partitionDeterminations(
      [
        {
          SignalId: 'signin-ip:203.0.113.42',
          Verdict: 'expected',
          DecidedUtc: '2026-08-20T13:02:00Z',
        },
      ],
      becData
    )
    expect(current).toHaveLength(0)
    expect(stale).toHaveLength(1)
    expect(windowStartUtc).toBe('2026-10-26T10:00:00Z')
  })

  it('treats a determination with no timestamp as current: a missing date is a data problem', () => {
    const { current } = partitionDeterminations([{ SignalId: 'x', Verdict: 'expected' }], becData)
    expect(current).toHaveLength(1)
  })

  it('accepts a single determination that arrived as a bare object', () => {
    const { current } = partitionDeterminations(
      { SignalId: 'x', Verdict: 'expected', DecidedUtc: '2026-10-30T08:00:00Z' },
      becData
    )
    expect(current).toHaveLength(1)
  })
})

describe('an analyst overriding the rules', () => {
  // The rules read the data, the analyst knows the client. A signal filed as noise that the
  // analyst calls unexpected has to count, otherwise the control offered is decoration.
  const noiseSignal = { id: 'safelist-unchanged', title: 'Liste d’expéditeurs inchangée', class: SIGNAL_CLASS.NOISE }

  it('reinstates a discarded signal the analyst calls unexpected', () => {
    const verdict = buildVerdict(
      [noiseSignal],
      [{ SignalId: 'safelist-unchanged', Verdict: 'unexpected' }]
    )
    expect(verdict.status).not.toBe(VERDICT_STATUS.CLEAN)
  })

  it('leaves a discarded signal discarded when it is called expected', () => {
    const verdict = buildVerdict(
      [noiseSignal],
      [{ SignalId: 'safelist-unchanged', Verdict: 'expected' }]
    )
    expect(verdict.status).toBe(VERDICT_STATUS.CLEAN)
  })

  it('leaves it discarded on undetermined, so an answer can raise a verdict but never lower one', () => {
    const verdict = buildVerdict(
      [noiseSignal],
      [{ SignalId: 'safelist-unchanged', Verdict: 'undetermined' }]
    )
    expect(verdict.status).toBe(VERDICT_STATUS.CLEAN)
  })
})
