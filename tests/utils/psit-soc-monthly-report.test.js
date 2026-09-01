import { describe, expect, it } from 'vitest'
import { buildMonthlyReportModel } from '../../src/utils/psit-soc-monthly-report'
import { psitReadSocMetrics } from '../../src/utils/psit-soc-metrics'

// One tenant, one month, as the endpoint answers when asked with the month's bounds.
const monthAnswer = {
  CaseCount: 4,
  OpenCount: 1,
  ByVerdict: [
    { Verdict: 'true-positive', Count: 2 },
    { Verdict: 'false-positive', Count: 1 },
    { Verdict: 'none', Count: 1 },
  ],
  ByStatus: [{ Status: 'closed', Count: 3 }],
  BySeverity: [{ Severity: 'P2', Count: 4 }],
  ByType: [
    {
      TypeId: 2,
      Count: 3,
      Qualified: 3,
      TruePositives: 2,
      BenignTruePositives: 0,
      FalsePositives: 1,
      Undetermined: 0,
      FpRatePercent: 33,
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
  ByTenant: [{ Tenant: 'client.test', Count: 4, Open: 1, TruePositives: 2 }],
  ByMonth: [{ Month: '2026-08', Count: 4, TruePositives: 2, FalsePositives: 1 }],
  Delays: {
    TakeMedianMinutes: 25,
    TakeCount: 4,
    VerdictMedianMinutes: 90,
    VerdictCount: 3,
    CloseMedianMinutes: 300,
    CloseCount: 3,
  },
  Window: { Tenant: 'client.test', StartUtc: '2026-08-01T00:00:00Z', EndUtc: '2026-09-01T00:00:00Z' },
}

const model = () =>
  buildMonthlyReportModel({
    tenant: 'client.test',
    month: '2026-08',
    metrics: psitReadSocMetrics(monthAnswer),
  })

describe('buildMonthlyReportModel', () => {
  it('opens with the month and the volume, agreed in French', () => {
    const report = model()
    expect(report.monthLabel).toBe('août 2026')
    expect(report.headline).toMatch(/En août 2026, 4 signalements/)
    expect(report.headline).toMatch(/ont été reçus et investigués/)
  })

  it('phrases every verdict bucket that has dossiers, the unqualified included', () => {
    const report = model()
    expect(report.verdicts.some((line) => /2 incidents réels confirmés/.test(line))).toBe(true)
    expect(report.verdicts.some((line) => /1 signalement sans objet/.test(line))).toBe(true)
    expect(report.verdicts.some((line) => /en cours de qualification/.test(line))).toBe(true)
  })

  it('names the incidents and points at the investigation reports', () => {
    const report = model()
    expect(report.incidentSentence).toMatch(/2 signalements correspondaient à un incident réel/)
    expect(report.incidentSentence).toMatch(/rapports d'investigation/)
  })

  it('labels the types from the catalogue and keeps N/D for a rate that does not exist', () => {
    const report = model()
    expect(report.types[0].label).not.toMatch(/^2$/)
    expect(report.types.find((entry) => entry.fpRate === 'N/D')).toBeTruthy()
    expect(report.types.find((entry) => entry.fpRate === '33 %')).toBeTruthy()
  })

  it('says the open dossier and formats the delays as durations', () => {
    const report = model()
    expect(report.openSentence).toMatch(/1 dossier du mois reste ouvert/)
    expect(report.delayRows.map((row) => row.value)).toEqual(['25 min', '1 h 30', '5 h'])
  })

  it('renders the quiet month as a sentence, never as a page of zeros', () => {
    const report = buildMonthlyReportModel({
      tenant: 'client.test',
      month: '2026-07',
      metrics: psitReadSocMetrics({ ...monthAnswer, CaseCount: 0, OpenCount: 0, ByVerdict: [], ByType: [], ByMonth: [] }),
    })
    expect(report.quiet).toBe(true)
    expect(report.headline).toMatch(/Aucun signalement de sécurité/)
    expect(report.headline).toMatch(/juillet 2026/)
    expect(report.headline).toMatch(/surveillance est restée active/)
    expect(report.incidentSentence).toBeNull()
  })
})
