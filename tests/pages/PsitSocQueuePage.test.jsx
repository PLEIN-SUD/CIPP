import React from 'react'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/queue'
import { ApiGetCall } from '../../src/api/ApiCall'

// The queue is where an analyst starts his day and where he returns between cases. What is pinned
// here is that it tells him what to do before he reads a row, names the type in words rather than
// by number, and never renders a failed read as an empty, restful queue.

vi.setConfig({ testTimeout: 60000 })

vi.mock('next/router', () => ({
  useRouter: () => ({ query: {}, pathname: '/security/soc/queue', push: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const cases = [
  {
    CaseId: 'PSIT-SOC-OLD',
    Tenant: 'contoso.test',
    TypeId: 2,
    Severity: 'P2',
    Status: 'new',
    Title: 'Deux pays en dix minutes',
    CreatedUtc: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    ExternalRef: '99600',
  },
  {
    CaseId: 'PSIT-SOC-WIP',
    Tenant: 'fabrikam.test',
    TypeId: 5,
    Severity: 'P3',
    Status: 'investigating',
    // Held by someone: 'à prendre' counts open dossiers nobody holds, whatever their status.
    AssignedTo: 'analyste@partner.test',
    Title: 'Règle de redirection',
    CreatedUtc: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    ExternalRef: '99601',
  },
]

// URL-aware on purpose: a blanket mock also answers the calls the creation drawer makes, and
// an error there fails the render for reasons that have nothing to do with the queue.
const wire = (data, extra = {}) =>
  ApiGetCall.mockImplementation((opts) => {
    if (String(opts?.url ?? '').includes('PSITListSocCases')) {
      return { data, isFetching: false, isSuccess: true, isError: false, ...extra }
    }
    return { data: undefined, isFetching: false, isSuccess: false, isError: false }
  })

describe('SOC triage queue', () => {
  it('says what is waiting before any row is read', () => {
    wire(cases)
    renderWithProviders(<Page />)

    expect(screen.getByText('1 à prendre')).toBeInTheDocument()
    expect(screen.getByText('1 en cours')).toBeInTheDocument()
  })

  it('names the untouched case that has waited longest, rather than counting them', () => {
    wire(cases)
    renderWithProviders(<Page />)

    expect(screen.getByText(/PSIT-SOC-OLD, il y a 5 h/)).toBeInTheDocument()
  })

  it('says so when nothing is waiting, instead of leaving the line blank', () => {
    wire([{ ...cases[1] }])
    renderWithProviders(<Page />)

    expect(screen.getByText(/Aucun dossier en attente de prise en charge/)).toBeInTheDocument()
  })

  it('shows a failed read as a failure, never as a quiet queue', () => {
    wire(undefined, { isError: true, isSuccess: false })
    renderWithProviders(<Page />)

    expect(screen.getByText(/La file n’a pas pu être lue/)).toBeInTheDocument()
    expect(screen.queryByText('1 à prendre')).not.toBeInTheDocument()
  })
})

