import {
  PSIT_LEGITIMATE_RMM,
  PSIT_SOC_SEVERITIES,
  PSIT_SOC_SOURCES,
  PSIT_SOC_STATUSES,
  PSIT_SOC_TYPES,
  PSIT_SOC_TYPE_OPTIONS,
  psitSocTypeById,
} from '../../src/utils/psit-soc-types'

// The catalogue is data the case view trusts blindly: a type without a guide renders an empty
// investigation, a type 8 that sneaks back in reopens a scope decision. These tests are the
// contract.

describe('PSIT_SOC_TYPES', () => {
  it('carries the seventeen retained types: 1-7 and 9-18, never 8', () => {
    const ids = PSIT_SOC_TYPES.map((type) => type.id)

    expect(ids).toHaveLength(17)
    expect(new Set(ids).size).toBe(17)
    expect(ids).not.toContain(8)
    expect(ids).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]))
  })

  it('gives every type a source, a default severity, a guide and both clue lists', () => {
    for (const type of PSIT_SOC_TYPES) {
      expect(Object.keys(PSIT_SOC_SOURCES)).toContain(type.source)
      expect(PSIT_SOC_SEVERITIES).toContain(type.severity)
      expect(type.label.length).toBeGreaterThan(10)
      expect(type.guide.length).toBeGreaterThan(1)
      expect(type.fpClues.length).toBeGreaterThan(0)
      expect(type.tpClues.length).toBeGreaterThan(0)
    }
  })

  it('gives every guide step a stable id, unique within its type', () => {
    for (const type of PSIT_SOC_TYPES) {
      const stepIds = type.guide.map((step) => step.id)
      expect(new Set(stepIds).size).toBe(stepIds.length)
      for (const stepId of stepIds) {
        // The step id is the triage key persisted in GuideProgress: it must survive a re-render
        // and a rewording, so it is a slug, never a position or a label.
        expect(stepId).toMatch(/^[a-z][a-z-]*$/)
      }
    }
  })

  it('keeps the priorities the external SOC states: 1 is P4, 2 is P2, 6 is P4, 11 is P3', () => {
    expect(psitSocTypeById(1).severity).toBe('P4')
    expect(psitSocTypeById(2).severity).toBe('P2')
    expect(psitSocTypeById(6).severity).toBe('P4')
    expect(psitSocTypeById(11).severity).toBe('P3')
  })

  it('treats an infostealer as P1: credentials are assumed exposed', () => {
    expect(psitSocTypeById(15).severity).toBe('P1')
  })
})

describe('psitSocTypeById', () => {
  it('resolves a numeric or string id, and returns null rather than throwing on garbage', () => {
    expect(psitSocTypeById(2).id).toBe(2)
    expect(psitSocTypeById('2').id).toBe(2)
    expect(psitSocTypeById(8)).toBeNull()
    expect(psitSocTypeById('not-a-type')).toBeNull()
    expect(psitSocTypeById(undefined)).toBeNull()
  })
})

describe('constants the rest of the dashboard leans on', () => {
  it('ships the legitimate-RMM list EMPTY: a public fork must not publish the whitelisted tooling', () => {
    // The real names live in internal knowledge until the list is wired to the private runtime
    // configuration. A name added here is published, indexed, and stays in the git history.
    expect(PSIT_LEGITIMATE_RMM).toEqual([])
  })

  it('mirrors the API status vocabulary exactly', () => {
    // Set-PSITSocCase validates against this list; a drift here is a 400 in production.
    expect(PSIT_SOC_STATUSES).toEqual([
      'new',
      'investigating',
      'qualified-fp',
      'qualified-tp',
      'contained',
      'closed',
    ])
  })

  it('builds one autocomplete option per type, labelled with its id', () => {
    expect(PSIT_SOC_TYPE_OPTIONS).toHaveLength(17)
    expect(PSIT_SOC_TYPE_OPTIONS[0].label).toMatch(/^1 - /)
  })
})
