import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/case'
import { ApiGetCall } from '../../src/api/ApiCall'

// The sequence itself is tested in psit-soc-next-step.test.js. What is pinned here is the wiring:
// that the case view actually shows the sentence, and that it follows the case rather than being
// decoration printed once.

vi.setConfig({ testTimeout: 60000 })

const routerQuery = { current: { caseId: 'PSIT-SOC-1', tenantFilter: 'contoso.test' } }
vi.mock('next/router', () => ({
  useRouter: () => ({ query: routerQuery.current, pathname: '/security/soc/case', push: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, refetch: vi.fn() })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = (overrides) => ({
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TypeId: 2,
  Severity: 'P2',
  Status: 'investigating',
  Title: 'Deux pays en dix minutes',
  Entities: {},
  GuideProgress: {},
  ActionLog: [],
  ...overrides,
})

const wire = (data) =>
  ApiGetCall.mockImplementation((opts) => {
    if (String(opts?.url ?? '').includes('PSITListSocCases')) {
      return { data: [data], isFetching: false, isFetched: true, isSuccess: true, isError: false, refetch: vi.fn() }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false, refetch: vi.fn() }
  })

describe('SOC case view', () => {
  it('opens with the next step rather than leaving the analyst to work it out', () => {
    wire(socCase({ Status: 'new' }))
    renderWithProviders(<Page />)

    expect(screen.getByText('Prendre le cas en charge')).toBeInTheDocument()
  })

  it('follows the case: a decided one is asked to be closed, not investigated', () => {
    wire(socCase({ Qualification: { Verdict: 'false-positive' } }))
    renderWithProviders(<Page />)

    expect(screen.getByText('Clore le cas')).toBeInTheDocument()
    expect(screen.queryByText('Prendre le cas en charge')).not.toBeInTheDocument()
  })

  it('says a closed case is closed instead of proposing work', () => {
    wire(socCase({ Status: 'closed', ClosedBy: 'analyste', ClosedUtc: '2026-08-25T10:00:00Z' }))
    renderWithProviders(<Page />)

    expect(screen.getByText('Cas clos')).toBeInTheDocument()
  })
})
