import { describe, expect, it } from 'vitest'
import {
  psitAutotaskMilestones,
  psitAutotaskNote,
} from '../../src/utils/psit-soc-autotask-note'

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TypeId: 2,
  Title: 'Connexion et activité dans deux pays',
  Status: 'contained',
  ClosedUtc: '',
  Qualification: {
    Verdict: 'true-positive',
    Justification: 'Titulaire joint : pas dans le pays',
    Analyst: 'a@partner.test',
    DecidedUtc: '2026-09-02T09:00:00Z',
  },
  ActionLog: [
    {
      Utc: '2026-09-02T09:05:00Z',
      Analyst: 'a@partner.test',
      Action: 'remediate-user',
      Detail: 'Remédiation immédiate sur vrai positif confirmé dès la validation : remédiation CIPP exécutée',
    },
    { Utc: '2026-09-02T08:30:00Z', Analyst: 'a@partner.test', Action: 'status', Detail: 'investigating' },
    { Utc: '2026-09-02T08:00:00Z', Analyst: 'webhook', Action: 'created', Detail: 'type 2' },
  ],
}

describe('psitAutotaskMilestones', () => {
  it('lists the reachable milestones, most recent first', () => {
    const milestones = psitAutotaskMilestones(socCase)
    expect(milestones.map((entry) => entry.key)).toEqual(['contained', 'qualified', 'taken'])
  })

  it('offers the closure once closed, and the hold only while held', () => {
    const closed = psitAutotaskMilestones({ ...socCase, Status: 'closed', ClosedUtc: '2026-09-02T10:00:00Z' })
    expect(closed[0].key).toBe('closed')

    const held = psitAutotaskMilestones({
      ...socCase,
      Status: 'on-hold',
      ActionLog: [
        { Utc: '2026-09-02T09:30:00Z', Analyst: 'a', Action: 'on-hold', Detail: 'Attente retour SOC externe' },
        ...socCase.ActionLog,
      ],
    })
    expect(held[0].key).toBe('on-hold')
    // Off hold, the stale entry stops being a milestone.
    expect(psitAutotaskMilestones(socCase).find((entry) => entry.key === 'on-hold')).toBeFalsy()
  })

  it('offers nothing on an untouched dossier: there is no milestone to report', () => {
    expect(
      psitAutotaskMilestones({ CaseId: 'X', Status: 'new', Qualification: null, ActionLog: [] })
    ).toEqual([])
  })
})

describe('psitAutotaskNote', () => {
  it('writes a self-sufficient note: reference, fact, author, date, link', () => {
    const milestones = psitAutotaskMilestones(socCase)
    const note = psitAutotaskNote(socCase, milestones[0], 'https://portal.example')

    expect(note).toContain('[SOC] Confinement / remédiation, dossier PSIT-SOC-1')
    expect(note).toContain('remédiation CIPP exécutée')
    expect(note).toContain('a@partner.test')
    expect(note).toContain(
      'https://portal.example/security/soc/case?caseId=PSIT-SOC-1&tenantFilter=contoso.test'
    )
  })

  it('quotes the recorded verdict on the qualification note', () => {
    const milestones = psitAutotaskMilestones(socCase)
    const note = psitAutotaskNote(
      socCase,
      milestones.find((entry) => entry.key === 'qualified'),
      ''
    )
    expect(note).toContain('vrai positif')
    expect(note).toContain('Titulaire joint : pas dans le pays')
  })
})
