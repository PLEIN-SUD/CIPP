import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test-utils'
import Page from '../../src/pages/security/soc/bec'
import { ApiGetCall } from '../../src/api/ApiCall'

// The BEC investigation moved into the security centre. What matters is that it is the same
// experience as before - the same decision panel, fed by the same collection - and that it fails
// legibly when opened without a target rather than rendering an empty shell.

vi.setConfig({ testTimeout: 60000 })

const routerQuery = vi.hoisted(() => ({ current: {} }))
vi.mock('next/router', () => ({
  useRouter: () => ({ query: routerQuery.current, push: vi.fn(), back: vi.fn() }),
}))

vi.mock('../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isLoading: false, isSuccess: false, refetch: vi.fn() })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const userData = {
  id: 'user-guid',
  displayName: 'Anna T',
  userPrincipalName: 'a.tkachenko@contoso.test',
}

// A collection with nothing the data settles alone: one filing rule, which is a question.
const becData = {
  ExtractedAt: '2026-08-24T10:32:00Z',
  NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }],
  SuspectUserSignIns: [],
  LocationAnalysis: { UsageLocation: 'FR' },
}

const wireApi = ({ bec = becData } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const key = opts?.queryKey ?? ''
    if (key.startsWith('ListUsers')) {
      return { data: [userData], isLoading: false, isSuccess: true, refetch: vi.fn() }
    }
    if (key.startsWith('execBECCheck-initial')) {
      return { data: { GUID: 'run-guid' }, isLoading: false, isSuccess: true, refetch: vi.fn() }
    }
    if (key.startsWith('execBECCheck-polling')) {
      return { data: bec, isLoading: false, isSuccess: true, dataUpdatedAt: 1, refetch: vi.fn() }
    }
    if (key.startsWith('PSITBecTriage')) {
      return { data: { Determinations: [] }, isLoading: false, isSuccess: true, refetch: vi.fn() }
    }
    return { data: undefined, isLoading: false, isSuccess: false, refetch: vi.fn() }
  })
}

describe('SOC BEC investigation page', () => {
  it('asks which mailbox to look at when opened without a target', () => {
    // Reached from the menu, the page has no user. It used to say so and stop there, which made
    // the menu entry a dead end: clicking it could never work. It now asks the one thing missing.
    routerQuery.current = {}
    wireApi()
    renderWithProviders(<Page />)

    expect(screen.getByText(/Choisir la boîte à investiguer/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lancer l’investigation/ })).toBeInTheDocument()
  })

  it('keeps the investigation button out of reach until a mailbox is chosen', () => {
    // A run with no target would land back on this same picker: better to say it is not ready.
    routerQuery.current = {}
    wireApi()
    renderWithProviders(<Page />)

    expect(screen.getByRole('button', { name: /Lancer l’investigation/ })).toBeDisabled()
  })

  it('shows the qualification once, with the evidence, and not again on the decision tab', async () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi()
    renderWithProviders(<Page />)

    // The name now appears in the header and on the native info card: both are the same person.
    expect(screen.getAllByText('Anna T').length).toBeGreaterThan(0)
    // Qualification moved to the evidence tab, where the judgement is actually made.
    await userEvent.click(screen.getByRole('tab', { name: 'Contrôles' }))
    expect(screen.getByText(/Qualification avant diffusion/)).toBeInTheDocument()

    // The decision tab carries the verdict, the report and the case record. Repeating the
    // qualification there put the same panel on two tabs.
    await userEvent.click(screen.getByRole('tab', { name: 'Décision' }))
    expect(screen.queryByText(/Qualification avant diffusion/)).not.toBeInTheDocument()
  })

  it('offers the way back to the case it was opened from', () => {
    routerQuery.current = {
      userId: 'user-guid',
      tenantFilter: 'contoso.test',
      caseId: 'PSIT-SOC-20260824-AAAA',
    }
    wireApi()
    renderWithProviders(<Page />)

    const back = screen.getByRole('link', { name: /Retour au cas/ })
    expect(back).toHaveAttribute(
      'href',
      '/security/soc/case?caseId=PSIT-SOC-20260824-AAAA&tenantFilter=contoso.test'
    )
  })

  it('keeps the upstream user page reachable rather than pretending it is gone', () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi()
    renderWithProviders(<Page />)

    expect(screen.getByRole('link', { name: /Vue upstream/ })).toHaveAttribute(
      'href',
      '/identity/administration/users/user/bec?userId=user-guid'
    )
  })
})

describe('SOC BEC investigation, tabs', () => {
  it('offers the three stages of the work as tabs', () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi()
    renderWithProviders(<Page />)

    expect(screen.getByRole('tab', { name: 'Décision' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Titulaire' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Contrôles' })).toBeInTheDocument()
  })

  it('opens on the account holder, and swaps panels when another tab is picked', async () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi()
    renderWithProviders(<Page />)

    // The page now opens on the account holder, so the assertion runs the other way round.
    expect(screen.getByText('Seconds facteurs')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Contrôles' }))
    expect(screen.queryByText('Seconds facteurs')).not.toBeInTheDocument()
  })
})

describe('SOC BEC investigation, while the collection runs', () => {
  // Launching an investigation used to land on the tabs over empty panels for the one to two
  // minutes the collection takes, which read as a broken page.
  it('stands the progress panel in for the tabs while the run is in flight', () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi({ bec: { Waiting: true } })
    renderWithProviders(<Page />)

    expect(screen.getByText('Collecte en cours')).toBeInTheDocument()
    // What a collection is, named: the analyst reads what is being gathered, not a bare spinner.
    expect(screen.getByText(/en train d’être rassemblé/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Contrôles' })).not.toBeInTheDocument()
  })

  it('hands over to the tabs once the collection lands', () => {
    routerQuery.current = { userId: 'user-guid', tenantFilter: 'contoso.test' }
    wireApi()
    renderWithProviders(<Page />)

    expect(screen.queryByText('Collecte en cours')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Contrôles' })).toBeInTheDocument()
  })
})
