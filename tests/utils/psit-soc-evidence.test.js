import { psitSocStepEvidence, PSIT_SOC_EVIDENCE_KEYS } from '../../src/utils/psit-soc-evidence'
import { PSIT_SOC_TYPES } from '../../src/utils/psit-soc-types'

// These answers sit next to a decision an analyst signs. The rules they must keep: report without
// concluding, never let "not fetched" read as "nothing found", and stay legible when the payload
// is not what was expected.

const signIn = (overrides) => ({
  ipAddress: '203.0.113.1',
  createdDateTime: '2026-08-24T09:00:00Z',
  status: { errorCode: 0 },
  location: { countryOrRegion: 'FR' },
  appDisplayName: 'Microsoft Graph',
  ...overrides,
})

describe('user evidence', () => {
  it('names the foreign successful address rather than counting rows', () => {
    const answer = psitSocStepEvidence('user.sessions', {
      user: {
        usageLocation: 'FR',
        signIns: [signIn({}), signIn({ ipAddress: '195.65.131.222', location: { countryOrRegion: 'CH' } })],
      },
    })

    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('195.65.131.222')
    expect(answer.text).toContain('CH')
  })

  it('reads a purely local account as expected activity', () => {
    const answer = psitSocStepEvidence('user.sessions', {
      user: { usageLocation: 'FR', signIns: [signIn({})] },
    })
    expect(answer.tone).toBe('good')
  })

  it('never lets data still in flight read as "nothing found"', () => {
    // undefined is "not fetched"; [] is "fetched and empty". They must not answer the same.
    expect(psitSocStepEvidence('user.sessions', { user: {} }).tone).toBe('unknown')
    expect(psitSocStepEvidence('user.sessions', { user: { signIns: [] } }).tone).toBe('unknown')
    expect(psitSocStepEvidence('user.rules', { user: {} }).tone).toBe('unknown')
    expect(psitSocStepEvidence('user.rules', { user: { rules: [] } }).tone).toBe('good')
  })

  it('flags the spray that got in and the client MFA cannot protect', () => {
    const failures = Array.from({ length: 6 }, () =>
      signIn({ ipAddress: '5.5.5.5', status: { errorCode: 50126 } })
    )
    const answer = psitSocStepEvidence('user.signin-quality', {
      user: { usageLocation: 'FR', signIns: [...failures, signIn({ ipAddress: '5.5.5.5' })] },
    })
    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('rafale')

    const legacy = psitSocStepEvidence('user.signin-quality', {
      user: { usageLocation: 'FR', signIns: [signIn({ appDisplayName: 'IMAP4' })] },
    })
    expect(legacy.text).toContain('client hérité')
  })

  it('says what an inbox rule does, not how many there are', () => {
    const answer = psitSocStepEvidence('user.rules', {
      user: { rules: [{ Name: 'copie', ForwardTo: 'attacker@evil.test' }, { Name: 'classement' }] },
    })
    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('transfère')

    const benign = psitSocStepEvidence('user.rules', {
      user: { rules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }] },
    })
    expect(benign.tone).toBe('good')
  })
})

describe('application evidence', () => {
  const catalogue = [{ Name: 'PerfectData Software', AppId: 'ff8d92dc-3d82-41d6-bcbd-b9174d163620' }]

  it('answers the catalogue question in place, either way', () => {
    const listed = psitSocStepEvidence('app.catalogue', {
      app: { appId: 'FF8D92DC-3D82-41D6-BCBD-B9174D163620', catalogue },
    })
    expect(listed.tone).toBe('bad')
    expect(listed.text).toContain('PerfectData Software')

    const clean = psitSocStepEvidence('app.catalogue', {
      app: { appId: '00000000-0000-0000-0000-000000000001', catalogue },
    })
    expect(clean.tone).toBe('good')
  })

  it('never answers "absent from the catalogue" about a catalogue nobody could read', () => {
    expect(psitSocStepEvidence('app.catalogue', { app: { appId: 'x' } }).tone).toBe('unknown')
  })

  it('names the risky scopes and the refresh token that makes them last', () => {
    const answer = psitSocStepEvidence('app.scopes', {
      app: { scope: 'User.Read Mail.ReadWrite offline_access' },
    })
    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('Mail.ReadWrite')
    expect(answer.text).toContain('offline_access')

    const readOnly = psitSocStepEvidence('app.scopes', { app: { scope: 'User.Read' } })
    expect(readOnly.tone).toBe('good')
  })

  it('distinguishes an unreadable consent from a harmless one', () => {
    expect(psitSocStepEvidence('app.scopes', { app: {} }).tone).toBe('unknown')
    expect(psitSocStepEvidence('app.scopes', { app: { scope: '' } }).tone).toBe('unknown')
  })

  it('reports the publisher with the date the application appeared', () => {
    const unverified = psitSocStepEvidence('app.publisher', {
      app: { principal: { createdDateTime: '2024-04-21T11:03:06Z' } },
    })
    expect(unverified.tone).toBe('bad')
    expect(unverified.text).toContain('2024-04-21')

    const verified = psitSocStepEvidence('app.publisher', {
      app: { principal: { verifiedPublisher: { displayName: 'Contoso Ltd' } } },
    })
    expect(verified.tone).toBe('good')
  })
})

describe('device evidence', () => {
  it('reports compliance with the user who has the machine', () => {
    const answer = psitSocStepEvidence('device.compliance', {
      device: { device: { complianceState: 'compliant', userPrincipalName: 'a@contoso.test' } },
    })
    expect(answer.tone).toBe('good')
    expect(answer.text).toContain('a@contoso.test')
  })

  it('flags an antivirus that was in no state to see anything', () => {
    const answer = psitSocStepEvidence('device.defender', {
      device: { defenderState: { signatureUpdateOverdue: true } },
    })
    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('signatures en retard')
  })

  it('says so when Intune does not know the machine', () => {
    expect(psitSocStepEvidence('device.compliance', { device: {} }).tone).toBe('unknown')
    expect(psitSocStepEvidence('device.defender', { device: {} }).tone).toBe('unknown')
  })
})

describe('the resolver contract', () => {
  it('renders nothing for a step that carries no evidence key', () => {
    expect(psitSocStepEvidence(undefined, {})).toBeNull()
    expect(psitSocStepEvidence('nope.unknown', {})).toBeNull()
  })

  it('survives a payload that is not what it expected', () => {
    // A guide that crashes on a malformed answer is worse than a guide with no answer.
    const answer = psitSocStepEvidence('user.rules', { user: { rules: 'not an array' } })
    expect(answer.tone).toBe('unknown')
    expect(psitSocStepEvidence('app.catalogue', null).tone).toBe('unknown')
  })

  it('has a resolver for every evidence key the catalogue references', () => {
    const referenced = new Set()
    for (const type of PSIT_SOC_TYPES) {
      for (const step of type.guide) if (step.evidence) referenced.add(step.evidence)
    }
    expect(referenced.size).toBeGreaterThan(0)
    for (const key of referenced) expect(PSIT_SOC_EVIDENCE_KEYS).toContain(key)
  })
})

describe('consent evidence', () => {
  // The one guide step that used to send the analyst to the Entra portal.
  it('names who consented, when, from where, and flags the off-hours instant', () => {
    const answer = psitSocStepEvidence('app.consent', {
      app: {
        consentAudit: [
          { who: 'p.durand@contoso.test', whenUtc: '2026-08-17T20:10:00Z', ip: '203.0.113.9', offHours: true },
        ],
      },
    })
    expect(answer.tone).toBe('bad')
    expect(answer.text).toContain('p.durand@contoso.test')
    expect(answer.text).toContain('HNO')
  })

  it('says the audit window is the limit, never that nobody consented', () => {
    const answer = psitSocStepEvidence('app.consent', { app: { consentAudit: [] } })
    expect(answer.tone).toBe('unknown')
    expect(answer.text).toMatch(/30 j/)
  })

  it('keeps "not loaded" apart from "nothing found"', () => {
    const answer = psitSocStepEvidence('app.consent', { app: {} })
    expect(answer.text).toMatch(/non chargé/)
  })
})

describe('download evidence keys', () => {
  it('routes the guide answer through the download reading', () => {
    const evidence = {
      download: {
        started: true,
        running: false,
        files: [],
        warnings: [],
        window: { startUtc: '2026-08-28T03:27:00Z', endUtc: '2026-08-28T19:27:00Z' },
        summary: {
          fileCount: 3,
          siteCount: 2,
          sites: [],
          extensions: [],
          firstUtc: '2026-08-28T15:20:00Z',
          lastUtc: '2026-08-28T15:50:00Z',
          addresses: ['203.0.113.9'],
          addressCount: 1,
          agents: ['Mozilla/5.0'],
        },
      },
    }
    const files = psitSocStepEvidence('download.files', evidence)
    expect(files.tone).toBe('bad')
    expect(files.text).toMatch(/3 fichier\(s\) depuis 2 site\(s\)/)

    const origin = psitSocStepEvidence('download.origin', evidence)
    expect(origin.tone).toBe('good')
    expect(origin.text).toMatch(/une seule adresse/)
  })

  it('says "recherche non lue" while the answer has not arrived, never an all-clear', () => {
    // undefined means the call is in flight or was never made - not an empty result.
    expect(psitSocStepEvidence('download.files', {}).text).toMatch(/non lue/)
    expect(psitSocStepEvidence('download.origin', {}).tone).toBe('unknown')
  })
})
