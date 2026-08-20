import {
  CONTAINMENT_ACTIONS,
  DATA_CATEGORIES,
  MAIL_READ_STATUS,
  buildContainment,
  buildExposure,
  buildThirdPartyExposure,
} from '../../src/utils/psit-bec-incident'
import { buildSignals } from '../../src/utils/psit-bec-signals'

const userData = { id: 'u1', userPrincipalName: 'p.taieb@contoso.test' }

const sentMessage = (overrides) => ({
  MessageTraceId: Math.random().toString(36).slice(2),
  Subject: 'Fwd: consultation',
  RecipientAddress: 'contact@client.test',
  Received: '2026-08-19T07:11:00Z',
  FromIP: '92.92.126.129',
  SystemGenerated: false,
  Internal: false,
  ForeignLocation: false,
  ...overrides,
})

describe('buildThirdPartyExposure', () => {
  const becData = {
    SentMessages: [
      // Flagged campaign subject, external.
      sentMessage({ Subject: 'Mise a jour bancaire', RecipientAddress: 'buyer@client.test' }),
      sentMessage({ Subject: 'Mise a jour bancaire', RecipientAddress: 'buyer2@client.test' }),
      // Sent from a foreign address.
      sentMessage({ RecipientAddress: 'ceo@partner.test', ForeignLocation: true }),
      // Internal: never in the annex.
      sentMessage({ RecipientAddress: 'colleague@contoso.test', Internal: true, Subject: 'Mise a jour bancaire' }),
      // Service-generated: never in the annex.
      sentMessage({
        RecipientAddress: 'someone@client.test',
        SystemGenerated: true,
        ForeignLocation: true,
      }),
      // Ordinary external mail with no flag: not in the annex either.
      sentMessage({ RecipientAddress: 'normal@client.test', Subject: 'Re: planning' }),
    ],
    SentMessageAnalysis: {
      TotalRecipients: 6,
      RepeatedSubjects: [{ Subject: 'Mise a jour bancaire', Flagged: true }],
      Bursts: [],
    },
  }

  it('keeps only external, human-sent mail that carried a flag', () => {
    const result = buildThirdPartyExposure(becData)
    const addresses = result.recipients.map((entry) => entry.address)

    expect(addresses).toEqual(
      expect.arrayContaining(['buyer@client.test', 'buyer2@client.test', 'ceo@partner.test'])
    )
    expect(addresses).not.toContain('colleague@contoso.test')
    expect(addresses).not.toContain('someone@client.test')
    expect(addresses).not.toContain('normal@client.test')
  })

  it('states the reason each recipient is listed', () => {
    const result = buildThirdPartyExposure(becData)
    expect(result.recipients.find((entry) => entry.address === 'buyer@client.test').reasons).toContain(
      'campagne à objet répété'
    )
    expect(result.recipients.find((entry) => entry.address === 'ceo@partner.test').reasons).toContain(
      'envoi depuis une IP hors zone'
    )
  })

  it('flags a recipient caught inside a burst window', () => {
    const result = buildThirdPartyExposure({
      SentMessages: [sentMessage({ RecipientAddress: 'x@client.test', Received: '2026-08-19T07:15:00Z' })],
      SentMessageAnalysis: {
        TotalRecipients: 1,
        RepeatedSubjects: [],
        Bursts: [{ WindowStart: '2026-08-19T07:10:00Z', WindowMinutes: 10 }],
      },
    })
    expect(result.recipients[0].reasons).toContain("rafale d'envoi")
  })

  it('says so when the trace it was given is only a sample', () => {
    const truncated = buildThirdPartyExposure({
      ...becData,
      SentMessageAnalysis: { ...becData.SentMessageAnalysis, TotalRecipients: 241 },
    })
    expect(truncated.truncated).toBe(true)
    expect(truncated.collectedRecipients).toBe(6)
    expect(truncated.totalRecipients).toBe(241)
  })
})

describe('buildExposure', () => {
  it('never asserts that mail was read, because the collection cannot show it', () => {
    const exposure = buildExposure({}, [], [])
    expect(exposure.mailReadSuggested).toBe(MAIL_READ_STATUS.NOT_PROVABLE)
    expect(exposure.mailReadNote).toContain('MailItemsAccessed')
    expect(exposure.mailReadNote).toContain('ne peut être ni établie ni exclue')
  })

  it('lists the persistence paths this collection does not cover', () => {
    const exposure = buildExposure({}, [], [])
    expect(exposure.notCovered.length).toBeGreaterThan(4)
    expect(exposure.notCovered.join(' ')).toContain('OAuth')
    expect(exposure.notCovered.join(' ')).toContain('IMAP')
  })

  it('derives access and exfiltration from established signals', () => {
    const becData = {
      NewRules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test' }],
      SentMessages: [sentMessage({ ForeignLocation: true })],
      LocationAnalysis: { UsageLocation: 'FR' },
    }
    const signals = buildSignals(becData, userData)
    const exposure = buildExposure(becData, signals, [])

    expect(exposure.accessEstablished).toBe(true)
    expect(exposure.accessBasis.join(' ')).toContain('copie')
    expect(exposure.exfiltration.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['forwarding-rule', 'outbound-from-foreign-ip'])
    )
  })

  it('counts an analyst-confirmed signal as a basis for access', () => {
    const becData = {
      NewRules: [],
      SuspectUserSignIns: [
        {
          CreatedDateTime: '2026-08-20T06:49:00Z',
          IPAddress: '146.241.181.10',
          Country: 'IT',
          Status: 'Success',
          ForeignLocation: true,
        },
      ],
      LocationAnalysis: { UsageLocation: 'FR' },
    }
    const signals = buildSignals(becData, userData)
    const target = signals.find((signal) => signal.id.startsWith('signin-ip:'))
    const exposure = buildExposure(becData, signals, [
      { SignalId: target.id, Verdict: 'unexpected', Analyst: 's.miro' },
    ])

    expect(exposure.accessEstablished).toBe(true)
    expect(exposure.accessBasis[0]).toContain('146.241.181.10')
  })

  it('offers a closed list of data categories for the analyst to pick from', () => {
    expect(DATA_CATEGORIES).toContain('Données de santé')
    expect(DATA_CATEGORIES).toContain('Données bancaires ou financières')
  })
})

describe('buildContainment', () => {
  it('marks an action done only when CIPP logged it, with its operator and time', () => {
    const containment = buildContainment({
      ActionsPerformed: [
        {
          Action: 'PasswordReset',
          Count: 1,
          FirstUtc: '2026-08-20T13:00:00Z',
          Operator: 's.miro@pleinsudit.com',
          HasFailure: false,
        },
        { Action: 'SessionsRevoked', Count: 1, FirstUtc: '2026-08-20T13:01:00Z', Operator: 's.miro@pleinsudit.com', HasFailure: true },
      ],
    })

    const password = containment.find((action) => action.key === 'PasswordReset')
    expect(password.done).toBe(true)
    expect(password.operator).toBe('s.miro@pleinsudit.com')

    const sessions = containment.find((action) => action.key === 'SessionsRevoked')
    expect(sessions.hasFailure).toBe(true)

    const mfa = containment.find((action) => action.key === 'MfaMethodsRemoved')
    expect(mfa.done).toBe(false)
  })

  it('returns every canonical action even with no log at all', () => {
    const containment = buildContainment({})
    expect(containment).toHaveLength(CONTAINMENT_ACTIONS.length)
    expect(containment.every((action) => action.done === false)).toBe(true)
  })
})
