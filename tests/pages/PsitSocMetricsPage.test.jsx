import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/metrics'
import { ApiGetCall } from '../../src/api/ApiCall'

// What is pinned here: the steering numbers arrive with their meaning intact. A type with no
// verdict yet shows N/D rather than a reassuring 0 %, the dossiers awaiting a verdict are a
// visible number, and a failed read looks like a failure rather than like a quiet period.

vi.setConfig({ testTimeout: 60000 })

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/security/soc/metrics', push: vi.fn(), back: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// ApexCharts does not render in jsdom; the page test asserts the data handed to the charts,
// not the SVG. One mock covers the direct Chart uses and CippChartCard alike.
vi.mock('../../src/components/chart', () => ({
  Chart: ({ type, series }) => (
    <div data-testid="chart" data-type={type} data-series={JSON.stringify(series)} />
  ),
}))

// The PDF stack is exercised by its own tests; the page test only needs the button's contract.
vi.mock('../../src/components/psit/PsitSocMonthlyReportFr', () => ({
  PsitSocMonthlyReportButton: ({ tenant, month, metrics, disabled }) => (
    <div data-testid="monthly-report-button">
      {disabled || !tenant || !month || !metrics ? 'rapport indisponible' : `rapport ${tenant} ${month}`}
    </div>
  ),
}))

// The endpoint's own shape, PascalCase, as Invoke-PSITListSocMetrics builds it.
const metricsAnswer = {
  CaseCount: 3,
  OpenCount: 1,
  ByVerdict: [
    { Verdict: 'true-positive', Count: 1 },
    { Verdict: 'none', Count: 2 },
  ],
  ByStatus: [{ Status: 'closed', Count: 2 }],
  BySeverity: [{ Severity: 'P2', Count: 3 }],
  ByType: [
    {
      TypeId: 2,
      Count: 2,
      Qualified: 1,
      TruePositives: 1,
      BenignTruePositives: 0,
      FalsePositives: 0,
      Undetermined: 0,
      FpRatePercent: 0,
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
  ByTenant: [{ Tenant: 'contoso.test', Count: 3, Open: 1, TruePositives: 1 }],
  ByMonth: [{ Month: '2026-08', Count: 3, TruePositives: 1, FalsePositives: 0 }],
  Delays: {
    TakeMedianMinutes: 30,
    TakeCount: 3,
    VerdictMedianMinutes: null,
    VerdictCount: 0,
    CloseMedianMinutes: 840,
    CloseCount: 2,
  },
  ByWeek: [{ Week: '2026-S36', Count: 3, TruePositives: 1, FalsePositives: 0 }],
  Window: { Tenant: 'AllTenants', StartUtc: '2026-06-01T00:00:00Z', EndUtc: '' },
}

// The previous window of equal length: what the KPI deltas compare against.
const previousAnswer = {
  ...metricsAnswer,
  CaseCount: 1,
  OpenCount: 0,
  ByVerdict: [{ Verdict: 'none', Count: 1 }],
  Delays: { ...metricsAnswer.Delays, TakeMedianMinutes: 40 },
}

const wireApi = ({ metrics, previous = previousAnswer } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    // The previous-window read carries an EndUtc on the AllTenants scope; the current one not.
    if (url.includes('PSITListSocMetrics') && url.includes('AllTenants') && url.includes('EndUtc=')) {
      return { data: previous, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('PSITListSocMetrics')) {
      return metrics === undefined
        ? { data: undefined, isFetching: true, isFetched: false, isSuccess: false, isError: false }
        : { data: metrics, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('ListTenants')) {
      return {
        data: [{ defaultDomainName: 'contoso.test', displayName: 'Contoso' }],
        isFetching: false,
        isFetched: true,
        isSuccess: true,
        isError: false,
      }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocMetricsPage', () => {
  it('shows the KPI tiles with their direction against the previous window', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    expect(screen.getByText('Dossiers reçus')).toBeInTheDocument()
    // 3 now vs 1 before: the tile says which way it moved.
    expect(screen.getByText('+2 vs période précédente')).toBeInTheDocument()
    expect(screen.getAllByText('Vrais positifs').length).toBeGreaterThan(0)
    // Take median 30 vs 40 before: falling is the good direction, said in minutes.
    expect(screen.getByText('−10 min vs période précédente')).toBeInTheDocument()
  })

  it('hands the charts the honest series: trend, verdicts with the waiting bucket', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    const charts = screen.getAllByTestId('chart')
    const area = charts.find((chart) => chart.dataset.type === 'area')
    expect(JSON.parse(area.dataset.series)[0]).toMatchObject({ name: 'Reçus', data: [3] })
    const donut = charts.find((chart) => chart.dataset.type === 'donut')
    // [FP, VP bénin, VP, indéterminé, à qualifier] — the waiting 2 stay visible.
    expect(JSON.parse(donut.dataset.series)).toEqual([0, 0, 1, 0, 2])
  })

  it('keeps N/D distinct from zero, on rates and on medians', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    // Type 5 has no verdict: N/D. Type 2 has one, at an honest 0 % — and the KPI tile
    // computes the same global rate, so the string legitimately appears twice.
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0 %').length).toBeGreaterThan(0)
  })

  it('says the delays as durations, with how many dossiers were measured', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    expect(screen.getAllByText('30 min').length).toBeGreaterThan(0)
    expect(screen.getByText('14 h')).toBeInTheDocument()
    expect(screen.getByText('0 mesurés')).toBeInTheDocument()
  })

  it('shows a failed read as a failure, never as a quiet period', () => {
    wireApi({ metrics: { Results: 'Les indicateurs ne sont pas disponibles.' }, previous: { Results: 'x' } })

    renderWithProviders(<Page />)

    expect(screen.getByText('Les indicateurs ne sont pas disponibles.')).toBeInTheDocument()
    expect(screen.queryByText(/0 dossiers/)).not.toBeInTheDocument()
  })

  it('holds the monthly report until a client is chosen', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    expect(screen.getByTestId('monthly-report-button')).toHaveTextContent('rapport indisponible')
  })
})
