import {
  PSIT_ADMIN_LEVEL,
  psitAdminRoleSummary,
  psitAdminSentence,
  psitReadAdminStatus,
} from '../../src/utils/psit-admin-status'

// The same facts arrive in two shapes: PascalCase from the endpoint, camelCase once filed on a
// dossier. A screen that knows only one of them shows a standard account the day the other
// reaches it - which, for this particular fact, means quietly clearing an administrator.

const live = {
  IsAdmin: true,
  IsEligible: false,
  ActiveRoles: ['Exchange Administrator'],
  EligibleRoles: [],
  ActiveRead: true,
  ReadUtc: '2026-08-29T10:00:00Z',
}

const filed = {
  isAdmin: true,
  isEligible: false,
  activeRoles: ['Exchange Administrator'],
  eligibleRoles: [],
  readUtc: '2026-08-29T10:00:00Z',
}

describe('psitReadAdminStatus', () => {
  it('reads the live answer and the filed one identically', () => {
    expect(psitReadAdminStatus(live)).toEqual(psitReadAdminStatus(filed))
    expect(psitReadAdminStatus(live).level).toBe(PSIT_ADMIN_LEVEL.ADMIN)
  })

  it('gives an eligible account its own level, not the standard one', () => {
    // Not an administrator right now, and one before the analyst finishes reading the screen.
    const status = psitReadAdminStatus({ IsAdmin: false, IsEligible: true, EligibleRoles: ['Global Administrator'], ActiveRead: true })
    expect(status.level).toBe(PSIT_ADMIN_LEVEL.ELIGIBLE)
  })

  it('keeps "standard" and "could not find out" apart', () => {
    expect(psitReadAdminStatus({ IsAdmin: false, ActiveRead: true }).level).toBe(
      PSIT_ADMIN_LEVEL.STANDARD
    )
    expect(psitReadAdminStatus({ IsAdmin: false, ActiveRead: false }).level).toBe(
      PSIT_ADMIN_LEVEL.UNKNOWN
    )
    expect(psitReadAdminStatus(undefined).level).toBe(PSIT_ADMIN_LEVEL.UNKNOWN)
  })

  it('treats a filed reading as successful, because nothing else is filed', () => {
    expect(psitReadAdminStatus(filed).level).toBe(PSIT_ADMIN_LEVEL.ADMIN)
  })
})

describe('psitAdminRoleSummary', () => {
  it('names the roles behind the badge', () => {
    const summary = psitAdminRoleSummary(psitReadAdminStatus(live))
    expect(summary).toMatch(/Exchange Administrator/)
  })

  it('says the roles could not be read rather than showing an empty tooltip', () => {
    const summary = psitAdminRoleSummary(psitReadAdminStatus({ ActiveRead: false }))
    expect(summary).toMatch(/n’ont pas pu être lus/)
  })
})

describe('psitAdminSentence', () => {
  it('states the fact for a report, with the roles that carry it', () => {
    expect(psitAdminSentence(live)).toMatch(/administrateur du tenant \(Exchange Administrator\)/)
  })

  it('states an on-demand role as on-demand', () => {
    const sentence = psitAdminSentence({ IsAdmin: false, IsEligible: true, EligibleRoles: ['Global Administrator'], ActiveRead: true })
    expect(sentence).toMatch(/activer un rôle d’administration à la demande/)
  })

  it('says nothing for a standard account, and nothing when it does not know', () => {
    // A client document listing the absence of a role for every person it names would bury the
    // one case that matters, and silence is not a claim.
    expect(psitAdminSentence({ IsAdmin: false, ActiveRead: true })).toBe('')
    expect(psitAdminSentence({ IsAdmin: false, ActiveRead: false })).toBe('')
    expect(psitAdminSentence(null)).toBe('')
  })
})
