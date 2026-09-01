import { describe, expect, it } from 'vitest'
import {
  psitMinutesLabel,
  psitMonthBounds,
  psitMonthLabel,
  psitReadSocMetrics,
  psitRecentMonths,
} from '../../src/utils/psit-soc-metrics'

// The endpoint's own shape, PascalCase, as Invoke-PSITListSocMetrics builds it.
const answer = {
  CaseCount: 3,
  OpenCount: 1,
  ByVerdict: [
    { Verdict: 'true-positive', Count: 1 },
    { Verdict: 'false-positive', Count: 1 },
    { Verdict: 'none', Count: 1 },
  ],
  ByStatus: [{ Status: 'closed', Count: 2 }],
  BySeverity: [{ Severity: 'P2', Count: 3 }],
  ByType: [
    {
      TypeId: 2,
      Count: 2,
      Qualified: 2,
      TruePositives: 1,
      BenignTruePositives: 0,
      FalsePositives: 1,
      Undetermined: 0,
      FpRatePercent: 50,
    },
    {
      TypeId: 5,
      Count: 1,
      Qualified: 0,
      TruePositives: 0,
      BenignTruePositives: 0,
      FalsePositives: 0,
      Undetermined: 0,
      FpRatePercent: null,
    },
  ],
  ByTenant: [{ Tenant: 'tenant1.test', Count: 2, Open: 0, TruePositives: 1 }],
  ByMonth: [{ Month: '2026-08', Count: 2, TruePositives: 1, FalsePositives: 1 }],
  Delays: {
    TakeMedianMinutes: 30,
    TakeCount: 3,
    VerdictMedianMinutes: 80,
    VerdictCount: 2,
    CloseMedianMinutes: 840,
    CloseCount: 2,
  },
  Window: { Tenant: 'AllTenants', StartUtc: '2026-06-01T00:00:00Z', EndUtc: '' },
}

describe('psitReadSocMetrics', () => {
  it('normalises the endpoint answer, window included', () => {
    const metrics = psitReadSocMetrics(answer)
    expect(metrics.caseCount).toBe(3)
    expect(metrics.openCount).toBe(1)
    expect(metrics.byVerdict).toHaveLength(3)
    expect(metrics.byTenant[0].tenant).toBe('tenant1.test')
    expect(metrics.delays.verdictMedianMinutes).toBe(80)
    expect(metrics.window.tenant).toBe('AllTenants')
  })

  it('keeps a null FP rate null: no verdict yet is not a rate of zero', () => {
    const metrics = psitReadSocMetrics(answer)
    expect(metrics.byType[0].fpRatePercent).toBe(50)
    expect(metrics.byType[1].fpRatePercent).toBeNull()
  })

  it('answers null for a payload that is not a metrics answer', () => {
    expect(psitReadSocMetrics(undefined)).toBeNull()
    expect(psitReadSocMetrics({ Results: 'erreur' })).toBeNull()
  })
})

describe('psitMinutesLabel', () => {
  it('says a median the way a person would, and N/D when nothing was measured', () => {
    expect(psitMinutesLabel(null)).toBe('N/D')
    expect(psitMinutesLabel(0)).toBe('0 min')
    expect(psitMinutesLabel(45)).toBe('45 min')
    expect(psitMinutesLabel(150)).toBe('2 h 30')
    expect(psitMinutesLabel(180)).toBe('3 h')
    expect(psitMinutesLabel(3 * 24 * 60)).toBe('3 j')
    expect(psitMinutesLabel(2 * 24 * 60 + 240)).toBe('2 j 4 h')
  })
})

describe('psitMonthLabel and psitMonthBounds', () => {
  it('says a yyyy-MM bucket as a French month', () => {
    expect(psitMonthLabel('2026-08')).toBe('août 2026')
    expect(psitMonthLabel('2026-01')).toBe('janvier 2026')
    expect(psitMonthLabel('n-importe-quoi')).toBe('n-importe-quoi')
  })

  it('bounds a month in UTC, end exclusive', () => {
    const bounds = psitMonthBounds('2026-08')
    expect(bounds.startUtc).toBe('2026-08-01T00:00:00.000Z')
    expect(bounds.endUtc).toBe('2026-09-01T00:00:00.000Z')
    expect(psitMonthBounds('')).toBeNull()
  })

  it('lists the recent months newest first, current one included', () => {
    const months = psitRecentMonths(3, new Date(Date.UTC(2026, 8, 15)))
    expect(months.map((entry) => entry.month)).toEqual(['2026-09', '2026-08', '2026-07'])
    expect(months[1].label).toBe('août 2026')
  })
})
