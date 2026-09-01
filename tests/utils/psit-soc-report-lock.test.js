import { describe, expect, it } from 'vitest'
import { psitSocReportLock } from '../../src/utils/psit-soc-report-lock'

describe('psitSocReportLock', () => {
  it('locks an unqualified dossier: a document that concludes nothing must not reach a client', () => {
    const lock = psitSocReportLock({ Status: 'investigating', Qualification: null })
    expect(lock.locked).toBe(true)
    expect(lock.reason).toMatch(/Qualifiez/)
  })

  it('locks an uncontained true positive: the containment section would be false when read', () => {
    const lock = psitSocReportLock({
      Status: 'qualified-tp',
      Qualification: { Verdict: 'true-positive' },
    })
    expect(lock.locked).toBe(true)
    expect(lock.reason).toMatch(/confinement/)
  })

  it('unlocks a contained or closed true positive', () => {
    expect(
      psitSocReportLock({ Status: 'contained', Qualification: { Verdict: 'true-positive' } }).locked
    ).toBe(false)
    expect(
      psitSocReportLock({ Status: 'closed', Qualification: { Verdict: 'true-positive' } }).locked
    ).toBe(false)
  })

  it('unlocks the benign and negative verdicts once posed: nothing burns there', () => {
    for (const verdict of ['benign-true-positive', 'false-positive', 'undetermined']) {
      expect(
        psitSocReportLock({ Status: 'investigating', Qualification: { Verdict: verdict } }).locked
      ).toBe(false)
    }
  })
})
