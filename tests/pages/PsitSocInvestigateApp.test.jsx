import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/investigate/app'
import { ApiGetCall } from '../../src/api/ApiCall'

// Directed consultation: looking asks for no case, acting does. What is pinned here is the door
// in both states - the picker when nothing is chosen, and the evidence plus the one exit (open a
// case) when an application is.

vi.setConfig({ testTimeout: 60000 })

const routerQuery = { current: {} }
vi.mock('next/router', () => ({
  useRouter: () => ({
    query: routerQuery.current,
    pathname: '/security/soc/investigate/app',
    push: vi.fn(),
  }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

describe('application investigation', () => {
  it('asks which application to examine when none is chosen', () => {
    routerQuery.current = {}
    ApiGetCall.mockImplementation(() => ({ data: undefined, isFetching: false, isSuccess: false }))
    renderWithProviders(<Page />)

    expect(screen.getByText(/Choisir l’application à examiner/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consulter' })).toBeDisabled()
  })

  it('shows the evidence and the one exit once an application is chosen', () => {
    routerQuery.current = {
      tenantFilter: 'contoso.test',
      appId: 'app-guid',
      appDisplayName: 'Salesloft Drift',
    }
    ApiGetCall.mockImplementation(() => ({ data: undefined, isFetching: false, isSuccess: false }))
    renderWithProviders(<Page />)

    // The rule, stated where it applies: evidence without a case, gestures within one.
    expect(screen.getByText(/les actions attendent un dossier/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Ouvrir un dossier depuis cette investigation/ })
    ).toBeInTheDocument()
    expect(screen.getByText('Contexte application')).toBeInTheDocument()
  })
})
