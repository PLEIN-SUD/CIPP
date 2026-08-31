import { describe, expect, it } from 'vitest'
import {
  PSIT_SOC_PHASES,
  psitSocPhaseComplete,
  psitSocPhaseGatingActive,
  psitSocPhaseRemaining,
  psitSocPhaseSteps,
  psitSocUnlockedPhases,
} from '../../src/utils/psit-soc-phases'
import { PSIT_SOC_TYPES } from '../../src/utils/psit-soc-types'

// A type-2 dossier created after the frame shipped: gating applies. Type 2's phases:
// validate=[sessions], scope=[] (empty: auto-complete), collect=[aitm, devicecode, bec], map=[client].
const gatedCase = (progress = {}) => ({
  CaseId: 'PSIT-SOC-1',
  TypeId: 2,
  Status: 'investigating',
  CreatedUtc: '2026-09-02T08:00:00Z',
  GuideProgress: progress,
  Qualification: null,
})

describe('the phase catalogue', () => {
  it('gives every guide step of every type a phase the frame knows', () => {
    const known = new Set(PSIT_SOC_PHASES.map((phase) => phase.key))
    for (const entry of PSIT_SOC_TYPES) {
      for (const step of entry.guide) {
        expect(known.has(step.phase), `type ${entry.id} step ${step.id}`).toBe(true)
      }
    }
  })

  it('gives every type at least one validate step: no dossier starts unvalidated', () => {
    for (const entry of PSIT_SOC_TYPES) {
      const validate = entry.guide.filter((step) => step.phase === 'validate')
      expect(validate.length, `type ${entry.id}`).toBeGreaterThan(0)
    }
  })
})

describe('psitSocUnlockedPhases', () => {
  it('opens only the first phase on a fresh gated dossier', () => {
    const unlocked = psitSocUnlockedPhases(gatedCase())
    expect(unlocked.has('validate')).toBe(true)
    expect(unlocked.has('scope')).toBe(false)
    expect(unlocked.has('decision')).toBe(false)
  })

  it('a completed phase opens the next, and an empty phase does not block', () => {
    // Type 2 has no scope steps: validating must open scope AND collect in one move.
    const unlocked = psitSocUnlockedPhases(gatedCase({ sessions: { State: 'done' } }))
    expect(unlocked.has('scope')).toBe(true)
    expect(unlocked.has('collect')).toBe(true)
    expect(unlocked.has('reconstruct')).toBe(false)
  })

  it("'sans objet' counts as work: skipped steps unlock like done ones", () => {
    const unlocked = psitSocUnlockedPhases(
      gatedCase({
        sessions: { State: 'done' },
        aitm: { State: 'skipped' },
        devicecode: { State: 'skipped' },
        bec: { State: 'skipped' },
      })
    )
    expect(unlocked.has('reconstruct')).toBe(true)
    expect(unlocked.has('map')).toBe(true)
    // map (client) still pending: decision stays locked.
    expect(unlocked.has('decision')).toBe(false)
  })

  it('names the steps a locked tab still waits for', () => {
    const remaining = psitSocPhaseRemaining(gatedCase({ sessions: { State: 'done' } }), 'reconstruct')
    expect(remaining.map((step) => step.id)).toEqual(['aitm', 'devicecode', 'bec'])
  })
})

describe('psitSocPhaseGatingActive: who the frame does NOT gate', () => {
  it('a dossier created before the frame shipped (grandfather clause, no migration)', () => {
    expect(
      psitSocPhaseGatingActive({ ...gatedCase(), CreatedUtc: '2026-08-28T15:27:00Z' })
    ).toBe(false)
  })

  it('a qualified, contained or closed dossier: everything is consultation', () => {
    expect(psitSocPhaseGatingActive({ ...gatedCase(), Qualification: { Verdict: 'false-positive' } })).toBe(false)
    expect(psitSocPhaseGatingActive({ ...gatedCase(), Status: 'closed' })).toBe(false)
    expect(psitSocPhaseGatingActive({ ...gatedCase(), Status: 'contained' })).toBe(false)
  })

  it('type 99 and unknown types: their guide says to fix the type first', () => {
    expect(psitSocPhaseGatingActive({ ...gatedCase(), TypeId: 99 })).toBe(false)
    expect(psitSocPhaseGatingActive({ ...gatedCase(), TypeId: 12345 })).toBe(false)
  })

  it('and everything is then unlocked', () => {
    const unlocked = psitSocUnlockedPhases({ ...gatedCase(), CreatedUtc: '2026-08-28T15:27:00Z' })
    expect(unlocked.size).toBe(PSIT_SOC_PHASES.length)
  })
})

describe('psitSocPhaseComplete tolerates both GuideProgress read shapes', () => {
  it('reads { State } and the bare-string legacy form alike', () => {
    expect(psitSocPhaseComplete(gatedCase({ sessions: { State: 'done' } }), 'validate')).toBe(true)
    expect(psitSocPhaseComplete(gatedCase({ sessions: 'done' }), 'validate')).toBe(true)
    expect(psitSocPhaseComplete(gatedCase({}), 'validate')).toBe(false)
  })

  it('lists the steps of one phase, in guide order', () => {
    const steps = psitSocPhaseSteps(gatedCase(), 'collect')
    expect(steps.map((step) => step.id)).toEqual(['aitm', 'devicecode', 'bec'])
  })
})
