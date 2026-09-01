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
  Window: { Tenant: 'AllTenants', StartUtc: '2026-06-01T00:00:00Z', EndUtc: '' },
}

const wireApi = ({ metrics } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
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
  it('shows the volumes with the dossiers awaiting a verdict as a number', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    expect(screen.getByText('3 dossiers')).toBeInTheDocument()
    expect(screen.getByText('1 ouverts')).toBeInTheDocument()
    expect(screen.getByText(/À qualifier : 2/)).toBeInTheDocument()
  })

  it('keeps N/D distinct from zero, on rates and on medians', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    // Type 5 has no verdict: N/D. Type 2 has one, at an honest 0 %.
    expect(screen.getAllByText('N/D').length).toBeGreaterThan(0)
    expect(screen.getByText('0 %')).toBeInTheDocument()
  })

  it('says the delays as durations, with how many dossiers were measured', () => {
    wireApi({ metrics: metricsAnswer })

    renderWithProviders(<Page />)

    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('14 h')).toBeInTheDocument()
    expect(screen.getByText('0 mesurés')).toBeInTheDocument()
  })

  it('shows a failed read as a failure, never as a quiet period', () => {
    wireApi({ metrics: { Results: 'Les indicateurs ne sont pas disponibles.' } })

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
