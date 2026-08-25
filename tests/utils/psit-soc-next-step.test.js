import { psitSocNextStep } from '../../src/utils/psit-soc-next-step'

// The case view shows this sentence above everything else, so the sequence it encodes is worth
// pinning. Two rules matter more than the rest: an analyst who has already decided is never sent
// back to a checklist, and a closed case says it is closed rather than proposing work.

const caseOf = (overrides) => ({
  CaseId: 'PSIT-SOC-1',
  TypeId: 2,
  Status: 'investigating',
  ...overrides,
})

// Type 2's first guide step, used to assert the guide is what is being pointed at.
const FIRST_STEP_ID = 'sessions'

describe('next step on a case', () => {
  it('answers nothing at all when there is no case', () => {
    expect(psitSocNextStep(null)).toBeNull()
  })

  it('asks for the case to be taken before anything else', () => {
    expect(psitSocNextStep(caseOf({ Status: 'new' })).id).toBe('take')
  })

  it('points at the first guide step still pending', () => {
    const next = psitSocNextStep(caseOf({ GuideProgress: {} }))
    expect(next.id).toBe('guide')
    expect(next.title).toMatch(/Étape suivante/)
  })

  it('skips over steps already handled, done or deliberately skipped', () => {
    const next = psitSocNextStep(
      caseOf({ GuideProgress: { [FIRST_STEP_ID]: { State: 'skipped' } } })
    )
    expect(next.id).toBe('guide')
    expect(next.title).not.toMatch(/sessions/i)
  })

  it('asks for a qualification once the guide is finished', () => {
    const progress = {}
    for (const id of ['sessions', 'aitm', 'devicecode', 'client', 'bec']) {
      progress[id] = { State: 'done' }
    }
    expect(psitSocNextStep(caseOf({ GuideProgress: progress })).id).toBe('qualify')
  })

  it('never sends an analyst who has decided back to the checklist', () => {
    // Qualifying before finishing the guide is legitimate: some cases are obvious. The next step
    // then follows the verdict, not the unticked boxes.
    const next = psitSocNextStep(
      caseOf({ GuideProgress: {}, Qualification: { Verdict: 'false-positive' } })
    )
    expect(next.id).toBe('close')
  })

  it('asks for containment on a true positive, then for closure once contained', () => {
    const qualified = caseOf({ Qualification: { Verdict: 'true-positive' } })
    expect(psitSocNextStep(qualified).id).toBe('contain')
    expect(psitSocNextStep({ ...qualified, Status: 'contained' }).id).toBe('close')
  })

  it('treats an undetermined verdict as a decision, not as unfinished work', () => {
    const next = psitSocNextStep(caseOf({ Qualification: { Verdict: 'undetermined' } }))
    expect(next.id).toBe('close')
    expect(next.detail).toMatch(/reste ouverte/)
  })

  it('says a closed case is closed instead of proposing work', () => {
    const next = psitSocNextStep(
      caseOf({ Status: 'closed', ClosedBy: 'analyste', ClosedUtc: '2026-08-25T10:00:00Z' })
    )
    expect(next.id).toBe('closed')
    expect(next.tone).toBe('done')
    expect(next.detail).toMatch(/analyste/)
  })

  it('asks for a qualification when the type carries no guide to follow', () => {
    expect(psitSocNextStep(caseOf({ TypeId: 4242 })).id).toBe('qualify')
  })
})
