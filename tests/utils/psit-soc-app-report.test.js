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
