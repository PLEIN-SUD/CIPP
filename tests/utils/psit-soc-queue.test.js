import {
  psitSocStatusLabel,
  psitSocDisplaySeverity,
  psitSocAge,
  psitSocGuideProgress,
  psitSocQueueSummary,
  psitSocQueueOrder,
  psitSocTypeLabel,
} from '../../src/utils/psit-soc-queue'

// The queue is the screen an analyst opens first and returns to between cases. What is pinned here
// is that it answers "what do I do now" without lying: an unknown date stays unknown rather than
// becoming "just now", a finished case sinks rather than disappearing, and the case that has
// waited longest is named rather than counted.

const NOW = Date.parse('2026-08-25T12:00:00Z')

const caseOf = (overrides) => ({
  CaseId: 'PSIT-SOC-1',
  Status: 'new',
  Severity: 'P3',
  TypeId: 2,
  CreatedUtc: '2026-08-25T11:00:00Z',
  ...overrides,
})

describe('age in words', () => {
  it('counts minutes, then hours, then days', () => {
    expect(psitSocAge('2026-08-25T11:30:00Z', NOW).label).toBe('30 min')
    expect(psitSocAge('2026-08-25T07:00:00Z', NOW).label).toBe('5 h')
    expect(psitSocAge('2026-08-20T12:00:00Z', NOW).label).toBe('5 j')
  })

  it('says nothing rather than "0 min" when there is no usable date', () => {
    // An empty cell reads as unknown. A zero reads as "it just came in", which is a claim.
    expect(psitSocAge(null, NOW)).toBeNull()
    expect(psitSocAge('pas une date', NOW)).toBeNull()
  })
})

describe('guide progress', () => {
  it('counts a skipped step as handled, because skipping is a decision', () => {
    const progress = psitSocGuideProgress(
      caseOf({ TypeId: 2, GuideProgress: { sessions: { State: 'done' }, aitm: { State: 'skipped' } } })
    )
    expect(progress.done).toBe(2)
    expect(progress.label).toBe(`2/${progress.total}`)
  })

  it('does not count a pending step', () => {
    const progress = psitSocGuideProgress(
      caseOf({ TypeId: 2, GuideProgress: { sessions: { State: 'pending' } } })
    )
    expect(progress.done).toBe(0)
  })

  it('stays empty for a type with no guide instead of claiming 0/0', () => {
    expect(psitSocGuideProgress(caseOf({ TypeId: 4242 }))).toBeNull()
  })
})

describe('type label', () => {
  it('gives the type in words, so nobody has to know the catalogue by heart', () => {
    expect(psitSocTypeLabel(2)).toMatch(/Voyage impossible/)
  })

  it('falls back to the number rather than showing nothing for an unknown type', () => {
    expect(psitSocTypeLabel(4242)).toBe('Type 4242')
  })
})

describe('queue summary', () => {
  it('names the untouched case that has waited longest, rather than counting them', () => {
    const summary = psitSocQueueSummary(
      [
        caseOf({ CaseId: 'recent', CreatedUtc: '2026-08-25T11:50:00Z' }),
        caseOf({ CaseId: 'ancien', CreatedUtc: '2026-08-25T07:00:00Z' }),
        caseOf({ CaseId: 'pris', Status: 'investigating', CreatedUtc: '2026-08-25T06:00:00Z' }),
      ],
      NOW
    )

    expect(summary.oldestUntaken.row.CaseId).toBe('ancien')
    expect(summary.oldestUntaken.age.label).toBe('5 h')
    // The one already taken is older still, and is not the answer: someone is on it.
    expect(summary.counts.new).toBe(2)
    expect(summary.open).toBe(3)
  })

  it('answers on an empty queue instead of throwing', () => {
    const summary = psitSocQueueSummary([], NOW)
    expect(summary.total).toBe(0)
    expect(summary.oldestUntaken).toBeNull()
  })
})

describe('queue order', () => {
  it('puts open cases first, then the most severe, then the oldest', () => {
    const ordered = psitSocQueueOrder([
      caseOf({ CaseId: 'clos', Status: 'closed', Severity: 'P1' }),
      caseOf({ CaseId: 'p3-vieux', Severity: 'P3', CreatedUtc: '2026-08-24T08:00:00Z' }),
      caseOf({ CaseId: 'p1', Severity: 'P1', CreatedUtc: '2026-08-25T11:00:00Z' }),
      caseOf({ CaseId: 'p3-recent', Severity: 'P3', CreatedUtc: '2026-08-25T11:30:00Z' }),
    ])

    expect(ordered.map((row) => row.CaseId)).toEqual(['p1', 'p3-vieux', 'p3-recent', 'clos'])
  })

  it('sinks finished cases instead of hiding them', () => {
    // A queue that quietly drops rows is a queue nobody trusts, and yesterday's closure has to
    // remain findable.
    const ordered = psitSocQueueOrder([caseOf({ CaseId: 'clos', Status: 'closed' }), caseOf({ CaseId: 'ouvert' })])
    expect(ordered.map((row) => row.CaseId)).toEqual(['ouvert', 'clos'])
    expect(ordered).toHaveLength(2)
  })
})

describe('the readings baked onto a row', () => {
  // The table body does not render cells under jsdom in this repository, so no page test can
  // assert a column's content. These are the values the columns display, checked where they are
  // produced: the reading is covered even though the cell is not.
  it('gives a row its type in words, its guide progress and its age', () => {
    const row = {
      TypeId: 2,
      GuideProgress: { sessions: { State: 'done' } },
      CreatedUtc: '2026-08-25T07:00:00Z',
    }

    expect(psitSocTypeLabel(row.TypeId)).toMatch(/Voyage impossible/)
    expect(psitSocGuideProgress(row).label).toBe('1/5')
    expect(psitSocAge(row.CreatedUtc, NOW).label).toBe('5 h')
  })
})

describe('psitSocDisplaySeverity', () => {
  // The regression this guards: the automation used to send the literal word Unknown when the
  // alert mail named no priority, and a stored tag shadowed any Severity set by hand in the
  // table - the analyst edited the base and saw nothing change.
  it('prefers the words of the emitter when the case carries them', () => {
    expect(psitSocDisplaySeverity({ SeverityTag: 'High Priority', Severity: 'P1' })).toBe(
      'High Priority',
    )
  })

  it('falls back to the P level when there is no tag', () => {
    expect(psitSocDisplaySeverity({ Severity: 'P2' })).toBe('P2')
  })

  it('treats the tag Unknown as an absence, never shadowing a hand-set severity', () => {
    expect(psitSocDisplaySeverity({ SeverityTag: 'Unknown', Severity: 'P3' })).toBe('P3')
  })

  it('shows an empty cell rather than inventing a level', () => {
    expect(psitSocDisplaySeverity({ SeverityTag: 'Unknown' })).toBe('')
    expect(psitSocDisplaySeverity(undefined)).toBe('')
  })
})

describe('psitSocStatusLabel', () => {
  // The stored codes are the API contract and stay English; the column shows the words the
  // analysts actually say. An unknown code passes through: raw data beats a hidden state.
  it('translates every lifecycle status', () => {
    expect(psitSocStatusLabel('new')).toBe('Nouveau')
    expect(psitSocStatusLabel('investigating')).toBe('En cours')
    expect(psitSocStatusLabel('qualified-fp')).toBe('Faux positif')
    expect(psitSocStatusLabel('qualified-tp')).toBe('Vrai positif')
    expect(psitSocStatusLabel('contained')).toBe('Confiné')
    expect(psitSocStatusLabel('closed')).toBe('Clos')
  })

  it('passes an unknown code through and answers absence with an empty string', () => {
    expect(psitSocStatusLabel('archived')).toBe('archived')
    expect(psitSocStatusLabel(undefined)).toBe('')
  })
})
