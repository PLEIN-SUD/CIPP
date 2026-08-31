import {
  PSIT_LEGITIMATE_RMM,
  PSIT_SOC_SEVERITIES,
  PSIT_SOC_SOURCES,
  PSIT_SOC_STATUSES,
  PSIT_SOC_TYPES,
  PSIT_SOC_TYPE_OPTIONS,
  psitSocTypeById,
  psitSocTypeEntities,
} from '../../src/utils/psit-soc-types'

// The catalogue is data the case view trusts blindly: a type without a guide renders an empty
// investigation, a type 8 that sneaks back in reopens a scope decision. These tests are the
// contract.

describe('PSIT_SOC_TYPES', () => {
  it('carries the retained types: 1-7, 9-19 and the catch-all, never 8', () => {
    // 8 was Google Workspace, out of scope for a portal that only manages Microsoft tenants.
    // 19 is application activity, which the emitter does not separate from consent. 99 is the
    // catch-all a subject lands on when its label matches nothing.
    const ids = PSIT_SOC_TYPES.map((type) => type.id)

    expect(ids).toHaveLength(15)
    expect(new Set(ids).size).toBe(15)
    expect(ids).not.toContain(8)
    expect(ids).toEqual(
      expect.arrayContaining([1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 15, 18, 19, 20, 99])
    )
    // Five entries were merged away, and none of them may come back as a live id: 3 was a
    // pointer to 1's own guide, and the Lighthouse family repeated the endpoint one in English.
    for (const retired of [3, 13, 14, 16, 17]) {
      expect(ids).not.toContain(retired)
    }
  })

  it('still answers for a dossier filed under a merged id', () => {
    // Retired ids stay resolvable on purpose: a dossier already stored under one, or an alert the
    // API has not been remapped for, keeps a category and a guide instead of a bare number.
    expect(psitSocTypeById(3).id).toBe(1)
    expect(psitSocTypeById(13).id).toBe(12)
    expect(psitSocTypeById(14).id).toBe(12)
    expect(psitSocTypeById(16).id).toBe(11)
    expect(psitSocTypeById(17).id).toBe(10)
  })

  it('keeps every label short enough to be read in a column', () => {
    // The catalogue used to carry a full sentence per entry, which is unreadable in a table cell
    // and was the reason an analyst could not tell two categories apart at a glance. The sentence
    // is not lost: it moved to description, which the guide and the reports show.
    for (const type of PSIT_SOC_TYPES) {
      expect(type.label.length).toBeLessThanOrEqual(34)
      expect(type.description.length).toBeGreaterThan(0)
    }
  })

  it('says which entities each type investigates, so the drawer knows what to ask for', () => {
    const known = ['user', 'app', 'device', 'mail']
    for (const type of PSIT_SOC_TYPES) {
      // The catch-all is the exception, and deliberately so: it does not know what the alert is
      // about, and a picker for the wrong entity fills the case with a fact that does not apply.
      if (type.id === 99) {
        expect(type.entities).toEqual([])
        continue
      }
      expect(type.entities.length).toBeGreaterThan(0)
      for (const entity of type.entities) expect(known).toContain(entity)
    }
    // A consent case is about an application, whatever the family it belongs to.
    expect(psitSocTypeEntities(6)).toContain('app')
    // An infostealer is a machine case and an identity case at once.
    expect(psitSocTypeEntities(15)).toEqual(['device', 'user'])
    expect(psitSocTypeEntities(18)).toEqual(['mail'])
    // An unknown type asks for nothing rather than guessing.
    expect(psitSocTypeEntities(999)).toEqual([])
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
      'qualified-btp',
      'contained',
      'closed',
    ])
  })

  it('builds one autocomplete option per type, labelled with its id', () => {
    expect(PSIT_SOC_TYPE_OPTIONS).toHaveLength(15)
    expect(PSIT_SOC_TYPE_OPTIONS[0].label).toMatch(/^1 - /)
  })
})
