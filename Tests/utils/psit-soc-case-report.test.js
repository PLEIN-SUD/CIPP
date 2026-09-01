import { describe, expect, it } from 'vitest'
import {
  CASE_CONCLUSIONS,
  buildCaseReportModel,
  psitCaseReportFindings,
  psitCaseReportJournal,
} from '../../src/utils/psit-soc-case-report'

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TypeId: 2,
  Title: 'Connexion et activité dans deux pays',
  TicketRef: 'T20260831.0042',
  Status: 'closed',
  CreatedUtc: '2026-08-31T12:54:00Z',
  Entities: { upn: 'p.martin@contoso.test' },
  Qualification: {
    Verdict: 'false-positive',
    Justification: 'Titulaire joint : VPN personnel confirmé',
    Analyst: 'a@partner.test',
    DecidedUtc: '2026-08-31T13:30:00Z',
    RootCause: 'VPN personnel',
    AttackTechniques: ['T1078'],
  },
  GuideProgress: {
    sessions: {
      State: 'done',
      By: 'a@partner.test',
      Utc: '2026-08-31T13:10:00Z',
      Note: 'Donnée : 2 adresses, aucun succès hors zone',
    },
    aitm: { State: 'skipped', By: 'a@partner.test', Utc: '2026-08-31T13:12:00Z', Note: 'Pas de MFA contourné' },
    devicecode: { State: 'unknown', By: 'a@partner.test', Utc: '2026-08-31T13:15:00Z', Note: 'Journal muet' },
  },
  ActionLog: [
    { Utc: '2026-08-31T13:30:00Z', Analyst: 'a@partner.test', Action: 'qualified', Detail: 'false-positive' },
    { Utc: '2026-08-31T12:54:00Z', Analyst: 'webhook', Action: 'created', Detail: 'type 2, source extsoc' },
  ],
}

describe('buildCaseReportModel', () => {
  it('phrases the dossier for the document: verdict, facts, entities in French', () => {
    const model = buildCaseReportModel(socCase)
    expect(model.verdictWord).toBe('faux positif')
    expect(model.conclusion).toBe(CASE_CONCLUSIONS['false-positive'])
    expect(model.typeLabel.length).toBeGreaterThan(0)
    expect(model.entities[0].label).toBe('Compte')
    expect(model.ticket).toBe('T20260831.0042')
  })

  it('leaves the conclusion null on an unqualified dossier: the lock reads it', () => {
    const model = buildCaseReportModel({ ...socCase, Qualification: null })
    expect(model.verdict).toBeNull()
    expect(model.conclusion).toBeNull()
  })
})

describe('psitCaseReportFindings', () => {
  it('lists the settled steps with their recorded finding, author and state word', () => {
    const rows = psitCaseReportFindings(socCase)
    const sessions = rows.find((row) => row.note.startsWith('Donnée :'))
    expect(sessions.state).toBe('faite')
    expect(sessions.by).toBe('a@partner.test')
    expect(rows.find((row) => row.state === 'sans objet')).toBeTruthy()
    expect(rows.find((row) => row.state === 'sans réponse')).toBeTruthy()
    // Untouched steps stay out of the final findings.
    expect(rows.find((row) => row.state === 'à faire')).toBeFalsy()
  })

  it('includes the untouched steps when the interim document asks for them', () => {
    const rows = psitCaseReportFindings(socCase, { includePending: true })
    expect(rows.find((row) => row.state === 'à faire')).toBeTruthy()
  })
})

describe('psitCaseReportJournal', () => {
  it('prints the journal oldest first, actions said in French', () => {
    const rows = psitCaseReportJournal(socCase)
    expect(rows[0].action).toBe('Dossier créé')
    expect(rows[1].action).toBe('Qualification')
  })
})
