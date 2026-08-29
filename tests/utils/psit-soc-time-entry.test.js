import { psitSocElapsedHours, psitSocTimeEntry } from '../../src/utils/psit-soc-time-entry'

// The draft an analyst pastes into the ticket. What is pinned is that it only ever says what the
// dossier recorded: no invented duration, no conclusion the dossier has not qualified, and an
// empty journal stated as empty rather than papered over.

const socCase = {
  CaseId: 'PSIT-SOC-20260828-985D',
  Tenant: 'client.test',
  TypeId: 2,
  Source: 'extsoc',
  ExternalRef: 'T20260828.0009',
  Entities: { upn: 'p.martin@client.test' },
  // The reader's shape: the journal names its author Analyst, and the verdict is nested.
  ActionLog: [
    {
      Utc: '2026-08-28T14:30:00Z',
      Action: 'revoked',
      Detail: 'Consentement révoqué',
      Analyst: 'analyste@partner.test',
    },
    { Utc: '2026-08-28T09:00:00Z', Action: 'ingested', Detail: 'Alerte reçue', Analyst: 'webhook' },
  ],
}

describe('psitSocTimeEntry', () => {
  it('opens with what the dossier is about, in the words of the portal', () => {
    const text = psitSocTimeEntry(socCase)
    expect(text).toMatch(/Investigation SOC PSIT-SOC-20260828-985D/)
    expect(text).toMatch(/Client : client\.test/)
    expect(text).toMatch(/Voyage impossible/)
    expect(text).toMatch(/Origine : SOC externe/)
    expect(text).toMatch(/upn p\.martin@client\.test/)
  })

  it('retells the journal forward in time', () => {
    // The panel reads newest first because an analyst wants the last thing that happened; a
    // ticket entry reads as a story, so it runs the other way.
    const text = psitSocTimeEntry(socCase)
    expect(text.indexOf('ingested')).toBeLessThan(text.indexOf('revoked'))
    expect(text).toMatch(/Consentement révoqué/)
  })

  it('states the qualification and its justification when the dossier carries one', () => {
    const text = psitSocTimeEntry({
      ...socCase,
      Qualification: {
        Verdict: 'false-positive',
        Justification: 'Déploiement assumé par le dirigeant',
      },
    })
    expect(text).toMatch(/faux positif/)
    expect(text).toMatch(/Déploiement assumé par le dirigeant/)
  })

  it('concludes nothing while the dossier concludes nothing', () => {
    const text = psitSocTimeEntry(socCase)
    expect(text).not.toMatch(/positif/)
  })

  it('says the journal is empty rather than describing work nobody recorded', () => {
    const text = psitSocTimeEntry({ ...socCase, ActionLog: [] })
    expect(text).toMatch(/Aucune action journalisée/)
  })

  it('prefers the declared time of an action to the moment it was written down', () => {
    const text = psitSocTimeEntry({
      ...socCase,
      ActionLog: [
        {
          Utc: '2026-08-28T18:00:00Z',
          OccurredUtc: '2026-08-28T11:15:00Z',
          Action: 'appel client',
        },
      ],
    })
    expect(text).toMatch(/11:15/)
    expect(text).not.toMatch(/18:00/)
  })

  it('answers nothing at all without a dossier', () => {
    expect(psitSocTimeEntry(undefined)).toBeNull()
    expect(psitSocTimeEntry({ Tenant: 'client.test' })).toBeNull()
  })
})

describe('psitSocElapsedHours', () => {
  it('measures the journal span to the quarter hour', () => {
    expect(psitSocElapsedHours(socCase.ActionLog)).toBe(5.5)
  })

  it('refuses to guess from a single entry', () => {
    // One action cannot describe a duration, and a fabricated number on a billable line is the
    // one mistake this helper must never make.
    expect(psitSocElapsedHours([socCase.ActionLog[0]])).toBeNull()
    expect(psitSocElapsedHours([])).toBeNull()
  })

  it('ignores entries whose date cannot be read', () => {
    expect(
      psitSocElapsedHours([{ Utc: 'pas une date' }, { Utc: '2026-08-28T09:00:00Z' }])
    ).toBeNull()
  })
})

describe('an undetermined qualification', () => {
  // 'Indéterminé' is an answer, not an absence of one, and a time entry that omits it reads as
  // an investigation that stopped without deciding anything.
  it('is stated in the ticket text', () => {
    const text = psitSocTimeEntry({
      ...socCase,
      Qualification: { Verdict: 'undetermined', Justification: 'Client injoignable' },
    })
    expect(text).toMatch(/indéterminé/)
    expect(text).toMatch(/Client injoignable/)
  })
})
