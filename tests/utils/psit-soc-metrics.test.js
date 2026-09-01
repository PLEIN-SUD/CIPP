import { describe, expect, it } from 'vitest'
import {
  psitFillMonths,
  psitFillWeeks,
  psitMetricsDeltas,
  psitMetricsFpRate,
  psitMinutesLabel,
  psitMonthBounds,
  psitMonthLabel,
  psitReadSocMetrics,
  psitRecentMonths,
  psitWeekLabels,
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


describe('psitWeekLabels', () => {
  it('says S36, and adds the year only when the series crosses a year boundary', () => {
    expect(psitWeekLabels([{ week: '2026-S35' }, { week: '2026-S36' }])).toEqual(['S35', 'S36'])
    expect(psitWeekLabels([{ week: '2026-S53' }, { week: '2027-S01' }])).toEqual([
      'S53 2026',
      'S01 2027',
    ])
  })
})

describe('psitMetricsFpRate', () => {
  it('computes the window-wide rate over qualified dossiers only', () => {
    const metrics = {
      byVerdict: [
        { verdict: 'false-positive', count: 3 },
        { verdict: 'true-positive', count: 1 },
        { verdict: 'none', count: 10 },
      ],
    }
    expect(psitMetricsFpRate(metrics)).toEqual({ ratePercent: 75, qualified: 4 })
  })

  it('answers null over an unqualified window: no rate is not a rate of zero', () => {
    expect(psitMetricsFpRate({ byVerdict: [{ verdict: 'none', count: 5 }] })).toEqual({
      ratePercent: null,
      qualified: 0,
    })
  })
})

describe('psitMetricsDeltas', () => {
  const window = (cases, tp, fp, take) => ({
    caseCount: cases,
    byVerdict: [
      { verdict: 'true-positive', count: tp },
      { verdict: 'false-positive', count: fp },
    ],
    delays: { takeMedianMinutes: take },
  })

  it('says the direction, and whether the move is good news', () => {
    const deltas = psitMetricsDeltas(window(12, 4, 2, 20), window(10, 6, 2, 45))
    // Volume is the emitter's: neither good nor bad.
    expect(deltas.cases).toMatchObject({ value: 12, delta: 2, trend: 'up', tone: 'neutral' })
    // Fewer true positives is the good direction.
    expect(deltas.truePositives).toMatchObject({ value: 4, delta: -2, tone: 'good' })
    // A falling take median is the good direction.
    expect(deltas.takeMedianMinutes).toMatchObject({ value: 20, delta: -25, tone: 'good' })
  })

  it('flags a rising FP rate as bad, in points', () => {
    const deltas = psitMetricsDeltas(window(10, 2, 6, 30), window(10, 5, 3, 30))
    // 6/8 = 75 % now vs 3/8 = 38 % before.
    expect(deltas.fpRatePercent.tone).toBe('bad')
    expect(deltas.fpRatePercent.delta).toBeGreaterThan(0)
  })

  it('answers a null delta when either window is missing or unmeasured', () => {
    expect(psitMetricsDeltas(window(5, 1, 1, null), window(4, 1, 1, 30)).takeMedianMinutes.delta).toBeNull()
    expect(psitMetricsDeltas(window(5, 1, 1, 30), null).cases.delta).toBeNull()
  })
})

// The aggregation only returns the periods that hold dossiers. What is pinned here is the
// repair: the window's empty months and weeks come back at zero, in order, so a trend chart
// has neighbours to draw a line between - and a missing window changes nothing.
describe('psitFillMonths', () => {
  const august = { month: '2026-08', count: 12, truePositives: 0, falsePositives: 5 }

  it('walks the whole window and puts the busy month where it belongs', () => {
    const filled = psitFillMonths([august], {
      startUtc: '2026-03-01T10:00:00Z',
      endUtc: '2026-09-01T09:00:00Z',
    })
    expect(filled.map((row) => row.month)).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ])
    expect(filled[5]).toEqual(august)
    expect(filled[4]).toEqual({ month: '2026-07', count: 0, truePositives: 0, falsePositives: 0 })
  })

  it('returns the rows untouched when the window is absent or unreadable', () => {
    expect(psitFillMonths([august], null)).toEqual([august])
    expect(psitFillMonths([august], { startUtc: 'garbage', endUtc: '2026-09-01T00:00:00Z' })).toEqual([august])
  })
})

describe('psitFillWeeks', () => {
  it('walks the ISO weeks of the window, zeros where nothing happened', () => {
    const s36 = { week: '2026-S36', count: 5, truePositives: 1, falsePositives: 2 }
    const filled = psitFillWeeks([s36], {
      startUtc: '2026-08-17T00:00:00Z',
      endUtc: '2026-09-01T12:00:00Z',
    })
    expect(filled.map((row) => row.week)).toEqual(['2026-S34', '2026-S35', '2026-S36'])
    expect(filled[0].count).toBe(0)
    expect(filled[2]).toEqual(s36)
  })

  it('starts from the Monday of the first ISO week, mid-week window starts included', () => {
    const filled = psitFillWeeks([], {
      startUtc: '2026-08-19T15:00:00Z',
      endUtc: '2026-08-31T08:00:00Z',
    })
    expect(filled.map((row) => row.week)).toEqual(['2026-S34', '2026-S35', '2026-S36'])
  })
})
