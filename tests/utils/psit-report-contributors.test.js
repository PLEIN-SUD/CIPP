import {
  psitContributorRole,
  psitReportContributors,
} from '../../src/utils/psit-report-contributors'

// A report that names who worked on a dossier has to name the right people. What is pinned here:
// the list comes from what happened rather than from who holds the record, automatic actors stay
// out of a client document, and nobody is invented.

const socCase = {
  AssignedTo: 'chef@partner.test',
  ClosedBy: 'alice@partner.test',
  ClosedUtc: '2026-08-28T17:00:00Z',
  Qualification: { Analyst: 'alice@partner.test', DecidedUtc: '2026-08-28T16:00:00Z' },
  ActionLog: [
    { Utc: '2026-08-28T09:00:00Z', Action: 'ingested', Analyst: 'webhook' },
    { Utc: '2026-08-28T10:00:00Z', Action: 'appel client', Analyst: 'alice@partner.test' },
    { Utc: '2026-08-28T11:00:00Z', Action: 'révocation', Analyst: 'bob@partner.test' },
  ],
}

describe('psitReportContributors', () => {
  it('names the people the journal names, in the order they first appear', () => {
    const people = psitReportContributors({ actionLog: socCase.ActionLog, socCase })
    expect(people.map((p) => p.upn)).toEqual([
      'alice@partner.test',
      'bob@partner.test',
      'chef@partner.test',
    ])
  })

  it('leaves the automation out of a client document', () => {
    // 'webhook' ingested the alert; it did not investigate it, and listing it as an intervener
    // would be false in a way no reader could correct.
    const people = psitReportContributors({ actionLog: socCase.ActionLog })
    expect(people.map((p) => p.upn)).not.toContain('webhook')
  })

  it('gathers what each person did, without repeating a gesture', () => {
    const people = psitReportContributors({ actionLog: socCase.ActionLog, socCase })
    const alice = people.find((p) => p.upn === 'alice@partner.test')
    expect(alice.actions).toContain('appel client')
    expect(alice.actions).toContain('qualification')
    expect(alice.actions).toContain('clôture')
    expect(new Set(alice.actions).size).toBe(alice.actions.length)
  })

  it('brackets each person by their first and last gesture', () => {
    const people = psitReportContributors({ actionLog: socCase.ActionLog, socCase })
    const alice = people.find((p) => p.upn === 'alice@partner.test')
    expect(alice.firstUtc).toBe('2026-08-28T10:00:00Z')
    expect(alice.lastUtc).toBe('2026-08-28T17:00:00Z')
  })

  it('reads a BEC record and its determinations, which have no journal', () => {
    const people = psitReportContributors({
      triage: [{ Analyst: 'carole@partner.test', DecidedUtc: '2026-08-20T09:00:00Z' }],
      incident: {
        CreatedBy: 'carole@partner.test',
        CreatedUtc: '2026-08-20T08:00:00Z',
        ClosedBy: 'david@partner.test',
        ClosedUtc: '2026-08-21T08:00:00Z',
      },
    })
    expect(people.map((p) => p.upn)).toEqual(['carole@partner.test', 'david@partner.test'])
    expect(people[0].firstUtc).toBe('2026-08-20T08:00:00Z')
  })

  it('answers an empty list rather than inventing anyone', () => {
    expect(psitReportContributors()).toEqual([])
    expect(psitReportContributors({ actionLog: [{ Action: 'x' }] })).toEqual([])
    // A name that is not an address is a service account or a label: no photo, no job title, no
    // hand in the investigation.
    expect(psitReportContributors({ actionLog: [{ Analyst: 'système', Action: 'x' }] })).toEqual([])
  })
})

describe('psitContributorRole', () => {
  it('lists the gestures when there are few enough to read', () => {
    expect(psitContributorRole({ actions: ['qualification', 'clôture'] })).toBe(
      'qualification, clôture'
    )
  })

  it('counts the rest rather than printing a paragraph in a table cell', () => {
    expect(psitContributorRole({ actions: ['a', 'b', 'c', 'd', 'e'] })).toBe('a, b, c et 2 autres gestes')
  })

  it('says nothing rather than inventing a role', () => {
    expect(psitContributorRole({ actions: [] })).toBe('')
    expect(psitContributorRole(undefined)).toBe('')
  })
})
