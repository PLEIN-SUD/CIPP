import { APP_CONCLUSION, buildAppReportModel } from '../../src/utils/psit-soc-app-report'

// The report's whole point is that an application alert has more than two honest endings. What is
// pinned here is that each of the four is reachable and none of them lies: a revocation is only
// reported when the tenant proves it, and an unqualified dossier concludes nothing.
//
// The fixtures carry the shape PSITListSocCases actually returns - the verdict nested under
// Qualification, the journal author under Analyst - because the first version of these tests
// carried the shape the write endpoint accepts, passed green, and proved nothing about a button
// that was disabled on every dossier in production.

const principalActive = { appId: 'app-guid', displayName: 'To-do Checklist', accountEnabled: true }
const principalRevoked = { ...principalActive, accountEnabled: false }

describe('buildAppReportModel', () => {
  it('reads a true positive as a malicious application', () => {
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'true-positive' } },
      principal: principalRevoked,
    })
    expect(model.kind).toBe(APP_CONCLUSION.MALICIOUS)
    expect(model.conclusion).toMatch(/illégitime/)
    expect(model.conclusion).toMatch(/révoqué/)
  })

  it('says the revocation is still to do when a true positive is still enabled', () => {
    // Reporting a cut that has not happened is the one failure this document cannot afford.
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'true-positive' } },
      principal: principalActive,
    })
    expect(model.kind).toBe(APP_CONCLUSION.MALICIOUS)
    expect(model.conclusion).toMatch(/reste à exécuter ou à vérifier/)
  })

  it('reads a false positive plus a disabled principal as legitimate but revoked', () => {
    // The field case: an admin deployed the app knowingly, then asked for it to be cut anyway.
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'false-positive' } },
      principal: principalRevoked,
    })
    expect(model.kind).toBe(APP_CONCLUSION.LEGIT_REVOKED)
    expect(model.conclusion).toMatch(/légitime/)
    expect(model.conclusion).toMatch(/à la demande du client/i)
  })

  it('reads a false positive on a still-active application as legitimate and kept', () => {
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'false-positive' } },
      principal: principalActive,
    })
    expect(model.kind).toBe(APP_CONCLUSION.LEGIT_KEPT)
    expect(model.conclusion).toMatch(/maintenu/)
  })

  it('concludes nothing while the dossier carries no verdict', () => {
    const model = buildAppReportModel({ socCase: {}, principal: principalActive })
    expect(model.kind).toBe(APP_CONCLUSION.UNQUALIFIED)
    expect(model.conclusion).toMatch(/ne conclut pas/)
  })

  it('never reports a revocation an absent principal cannot prove', () => {
    // No principal means the read failed or the app is gone - neither proves a revocation.
    const model = buildAppReportModel({ socCase: { Qualification: { Verdict: 'false-positive' } } })
    expect(model.revoked).toBe(false)
    expect(model.kind).toBe(APP_CONCLUSION.LEGIT_KEPT)
  })

  it('separates admin consents from individual ones and orders the journal oldest first', () => {
    const model = buildAppReportModel({
      socCase: {
        Qualification: { Verdict: 'false-positive' },
        ActionLog: [
          { Utc: '2026-08-28T10:00:00Z', Action: 'revoked', Analyst: 'analyste@partner.test' },
          { Utc: '2026-08-27T09:00:00Z', Action: 'ingested', Analyst: 'webhook' },
        ],
      },
      principal: principalRevoked,
      consents: [
        { kind: 'admin', who: "Toute l'organisation" },
        { kind: 'user', who: 'dirigeant@client.test' },
      ],
      scopes: { granted: ['Mail.Read', 'offline_access'], risky: [{ scope: 'Mail.Read', why: 'lit la boîte' }] },
    })

    expect(model.adminConsents).toHaveLength(1)
    expect(model.userConsents).toHaveLength(1)
    // A report reads forward in time; the panel reads newest first. They are two different jobs.
    expect(model.journal[0].Action).toBe('ingested')
    expect(model.riskyScopes).toHaveLength(1)
    expect(model.grantedScopes).toContain('offline_access')
  })
})

describe('the third verdict', () => {
  // An adversarial review caught this: reading "anything that is not true-positive" as a false
  // positive made an undetermined dossier produce a client document asserting the application was
  // legitimate, which is the one conclusion the analyst had explicitly refused to draw.
  it('concludes nothing when the analyst could not conclude', () => {
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'undetermined' } },
      principal: principalActive,
    })
    expect(model.kind).toBe(APP_CONCLUSION.UNDETERMINED)
    expect(model.conclusion).toMatch(/n'a pas permis de trancher/)
    // The sentence the bug produced, word for word, must not come back.
    expect(model.conclusion).not.toMatch(/conclut à une application légitime/)
  })

  it('says the access was cut without pretending that settled the question', () => {
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'undetermined' } },
      principal: principalRevoked,
    })
    expect(model.kind).toBe(APP_CONCLUSION.UNDETERMINED)
    expect(model.conclusion).toMatch(/sans répondre à la question/)
  })
})

describe('a revocation that deletes its own evidence', () => {
  // Reported from a real report: once the consent is revoked, the grants are gone from the
  // tenant, so a report read live shows an application with no consent and no permission - the
  // state the remediation created, not the one that was investigated. The revocation now files
  // what it removes on the dossier, and that copy is what the report describes.
  const revokedCase = {
    Qualification: { Verdict: 'false-positive' },
    Evidence: {
      app: {
        revokedUtc: '2026-08-29T09:34:25Z',
        removedGrants: [
          { consentType: 'AllPrincipals', scope: 'Tasks.ReadWrite offline_access' },
          { consentType: 'Principal', principalId: 'user-guid', scope: 'User.Read' },
        ],
      },
    },
  }

  it('describes the access as it was, when the tenant no longer has it', () => {
    const model = buildAppReportModel({
      socCase: revokedCase,
      principal: principalRevoked,
      consents: [],
      scopes: { granted: [], risky: [] },
    })

    expect(model.adminConsents).toHaveLength(1)
    expect(model.userConsents).toHaveLength(1)
    expect(model.grantedScopes).toEqual(
      expect.arrayContaining(['Tasks.ReadWrite', 'offline_access', 'User.Read'])
    )
    expect(model.fromSnapshot).toBe(true)
    expect(model.revokedUtc).toBe('2026-08-29T09:34:25Z')
  })

  it('prefers what the tenant says while the tenant still says something', () => {
    // Before a revocation the live read is the truth; the snapshot only answers once it is not.
    const model = buildAppReportModel({
      socCase: revokedCase,
      principal: principalActive,
      consents: [{ kind: 'admin', who: "Toute l'organisation" }],
      scopes: { granted: ['Mail.Read'], risky: [] },
    })

    expect(model.grantedScopes).toEqual(['Mail.Read'])
    expect(model.fromSnapshot).toBe(false)
  })

  it('claims no snapshot when none was kept', () => {
    const model = buildAppReportModel({
      socCase: { Qualification: { Verdict: 'false-positive' } },
      principal: principalRevoked,
      consents: [],
    })
    expect(model.fromSnapshot).toBe(false)
    expect(model.adminConsents).toHaveLength(0)
  })
})

describe('the benign true positive outcomes', () => {
  const benignCase = {
    CaseId: 'PSIT-SOC-1',
    Qualification: { Verdict: 'benign-true-positive', Justification: 'déploiement assumé, hors circuit' },
    ActionLog: [],
  }

  it('a revoked benign app says the detection was right AND that there was no compromise', () => {
    const model = buildAppReportModel({
      socCase: benignCase,
      principal: { accountEnabled: false },
    })

    expect(model.kind).toBe(APP_CONCLUSION.BENIGN_REVOKED)
    expect(model.conclusion).toMatch(/signalement était fondé/)
    expect(model.conclusion).toMatch(/écarte la compromission/)
    expect(model.conclusion).toMatch(/reste pertinent/)
  })

  it('a kept benign app lands on its own conclusion, not on the plain legitimate one', () => {
    const model = buildAppReportModel({
      socCase: benignCase,
      principal: { accountEnabled: true },
    })

    expect(model.kind).toBe(APP_CONCLUSION.BENIGN_KEPT)
    expect(model.conclusion).toMatch(/maintenu/)
  })
})
