import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitSocBecSection } from '../../../src/components/psit/soc/PsitSocBecSection'
import { ApiGetCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isSuccess: false, isError: false, refetch: vi.fn() })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = {
  CaseId: 'PSIT-SOC-1',
  Tenant: 'contoso.test',
  TicketRef: 'T20260831.0012',
  Entities: { upn: 'p.martin@contoso.test', userId: 'user-guid' },
}

const wireApi = ({ incidentExists = false, triage = [] } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = String(opts?.url ?? '')
    if (url.includes('PSITListBecIncident')) {
      return {
        data: { Incident: { Exists: incidentExists }, Remediation: { Entries: [], ActionsPerformed: [] } },
        isFetching: false,
        isSuccess: true,
        isError: false,
        refetch: vi.fn(),
      }
    }
    if (url.includes('PSITListBecTriage')) {
      return { data: triage, isFetching: false, isSuccess: true, isError: false, refetch: vi.fn() }
    }
    // execBECCheck and the user lookup: never answered in these tests.
    return { data: undefined, isFetching: false, isSuccess: false, isError: false, refetch: vi.fn() }
  })
}

describe('PsitSocBecSection', () => {
  it('offers the collection as a gesture, never as a side effect of opening a dossier', () => {
    wireApi()
    renderWithProviders(
      <PsitSocBecSection socCase={socCase} queryKey="k" part="collect" started={false} onStart={vi.fn()} />
    )

    expect(screen.getByRole('button', { name: 'Lancer la collecte BEC' })).toBeInTheDocument()
    // The orchestrated mailbox read must not have been queued.
    const becCalls = ApiGetCall.mock.calls.filter(([opts]) =>
      String(opts?.url ?? '').includes('execBECCheck')
    )
    expect(becCalls.every(([opts]) => !opts.waiting)).toBe(true)
  })

  it('starts by itself when a fiche BEC already exists: the investigation is engaged', () => {
    wireApi({ incidentExists: true })
    const onStart = vi.fn()
    renderWithProviders(
      <PsitSocBecSection socCase={socCase} queryKey="k" part="collect" started={false} onStart={onStart} />
    )

    expect(onStart).toHaveBeenCalled()
  })

  it('starts by itself when triage determinations exist', () => {
    wireApi({ triage: [{ SignalId: 's1', Determination: 'unexpected' }] })
    const onStart = vi.fn()
    renderWithProviders(
      <PsitSocBecSection socCase={socCase} queryKey="k" part="decision" started={false} onStart={onStart} />
    )

    expect(onStart).toHaveBeenCalled()
  })

  it('the decision part points to the collect tab while nothing started', () => {
    wireApi()
    renderWithProviders(
      <PsitSocBecSection socCase={socCase} queryKey="k" part="decision" started={false} onStart={vi.fn()} />
    )

    expect(screen.getByText(/dans l’onglet « 3. Preuves »/)).toBeInTheDocument()
  })

  it('clicking the button is the start gesture', async () => {
    wireApi()
    const onStart = vi.fn()
    renderWithProviders(
      <PsitSocBecSection socCase={socCase} queryKey="k" part="collect" started={false} onStart={onStart} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Lancer la collecte BEC' }))

    expect(onStart).toHaveBeenCalled()
  })

  it('renders nothing for a dossier that names no user', () => {
    wireApi()
    const { container } = renderWithProviders(
      <PsitSocBecSection
        socCase={{ ...socCase, Entities: {} }}
        queryKey="k"
        part="collect"
        started={false}
        onStart={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
