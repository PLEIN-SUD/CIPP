import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

    expect(screen.getByText('Prendre le dossier en charge')).toBeInTheDocument()
  })

  it('follows the case: a decided one is asked to be closed, not investigated', () => {
    wire(socCase({ Qualification: { Verdict: 'false-positive' } }))
    renderWithProviders(<Page />)

    expect(screen.getByText('Clore le dossier')).toBeInTheDocument()
    expect(screen.queryByText('Prendre le dossier en charge')).not.toBeInTheDocument()
  })

  it('says a closed case is closed instead of proposing work', () => {
    wire(socCase({ Status: 'closed', ClosedBy: 'analyste', ClosedUtc: '2026-08-25T10:00:00Z' }))
    renderWithProviders(<Page />)

    expect(screen.getByText('Dossier clos')).toBeInTheDocument()
  })
})

describe('SOC case view, tabs', () => {
  // The same three tabs as the BEC screen, in the same order: one mental model for both
  // investigation views. Sixteen stacked panels is the layout the user rejected on BEC.
  it('opens on the summary, with the journal beside the record', () => {
    wire(socCase({}))
    renderWithProviders(<Page />)

    expect(screen.getByRole('tab', { name: 'Synthèse' })).toBeInTheDocument()
    expect(screen.getByText('Journal des actions')).toBeInTheDocument()
    // The guide belongs to the investigation tab, not the summary.
    expect(screen.queryByText('Guide d’investigation')).not.toBeInTheDocument()
  })

  it('keeps the next step visible whatever the tab', async () => {
    // A grandfathered dossier (created before the frame): every tab open, décision reachable.
    wire(socCase({ Status: 'new', CreatedUtc: '2026-08-20T08:00:00Z' }))
    renderWithProviders(<Page />)

    await userEvent.click(screen.getByRole('tab', { name: /Décision & Réponse/ }))
    expect(screen.getByText('Prendre le dossier en charge')).toBeInTheDocument()
    expect(screen.getByText('Qualification')).toBeInTheDocument()
  })

  it('gates a fresh dossier: only Valider is open, and the frame says what unlocks next', async () => {
    wire(socCase({ CreatedUtc: '2026-09-02T08:00:00Z' }))
    renderWithProviders(<Page />)

    // Type 2's validate phase is the sessions step; everything beyond is earned.
    expect(screen.getByRole('tab', { name: /1\. Valider/ })).toBeEnabled()
    expect(screen.getByRole('tab', { name: /3\. Preuves/ })).toBeDisabled()
    expect(screen.getByRole('tab', { name: /Décision & Réponse/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('tab', { name: /1\. Valider/ }))
    expect(screen.getByText('Valider l’alerte')).toBeInTheDocument()
    // The assumed shortcut: an evident FP/BTP qualifies here, a TP never does.
    expect(screen.getByText('Raccourci de qualification')).toBeInTheDocument()
    expect(screen.getByText(/Onglet suivant verrouillé/)).toBeInTheDocument()
  })

  it('opens everything on a grandfathered dossier: no retroactive locking', () => {
    wire(socCase({ CreatedUtc: '2026-08-20T08:00:00Z' }))
    renderWithProviders(<Page />)

    expect(screen.getByRole('tab', { name: /3\. Preuves/ })).toBeEnabled()
    expect(screen.getByRole('tab', { name: /Décision & Réponse/ })).toBeEnabled()
  })

  it('keeps the journal in the margin of every tab: document as you go', async () => {
    wire(socCase({ CreatedUtc: '2026-08-20T08:00:00Z' }))
    renderWithProviders(<Page />)

    // On the summary AND after switching tab, the journal card is there.
    expect(screen.getByText('Journal des actions')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /1\. Valider/ }))
    expect(screen.getByText('Journal des actions')).toBeInTheDocument()
  })
})
