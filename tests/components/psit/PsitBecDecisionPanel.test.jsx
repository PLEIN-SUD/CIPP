import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecDecisionPanel } from '../../../src/components/psit/PsitBecDecisionPanel'
import { PsitBecArchivedEvidenceButton } from '../../../src/components/psit/PsitBecArchivedEvidenceButton'
import { ApiGetCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })


vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({
    data: undefined,
    isFetching: false,
    isSuccess: false,
    isError: false,
    refetch: vi.fn(),
  })),
  ApiPostCall: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

vi.mock('@react-pdf/renderer', () => {
  // `render` is honoured, not ignored: react-pdf calls it with the page counters, and a component
  // that only rendered `children` made every title using a render callback vanish from the assertions
  // while the real PDF printed it. First page of its own flow, which is the common case.
  const passthrough =
    (tag) =>
    ({ children, render }) =>
      React.createElement(
        tag,
        null,
        typeof render === 'function'
          ? render({ pageNumber: 1, totalPages: 1, subPageNumber: 1, subPageTotalPages: 1 })
          : children
      )
  return {
    Document: passthrough('div'),
    Page: passthrough('div'),
    View: passthrough('div'),
    Text: passthrough('span'),
    Image: () => null,
    Svg: () => null,
    Path: () => null,
    Circle: () => null,
    Line: () => null,
    Rect: () => null,
    G: () => null,
    PDFViewer: passthrough('div'),
    PDFDownloadLink: passthrough('div'),
    StyleSheet: { create: (styles) => styles },
    Font: {
      register: () => {},
      registerHyphenationCallback: () => {},
      registerEmojiSource: () => {},
    },
    pdf: () => ({ toBlob: () => Promise.resolve(new Blob()) }),
  }
})

const userData = { id: 'user-guid', userPrincipalName: 'p.martin@contoso.test' }

const becData = {
  ExtractedAt: new Date().toISOString(),
  NewRules: [{ Name: 'classement', MoveToFolder: 'DOSSIERS' }],
  SuspectUserSignIns: [],
  LocationAnalysis: { UsageLocation: 'FR' },
}

describe('PsitBecDecisionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isError: false,
      refetch: vi.fn(),
    }))
  })

  it('gathers the verdict, the reports and both panels in one place', () => {
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[]}
        onRestart={vi.fn()}
      />
    )

    expect(screen.getByText('Décision et fiche BEC')).toBeInTheDocument()
    // No level while a question is open, and the panel says what that implies.
    expect(screen.getAllByText(/À qualifier/).length).toBeGreaterThan(0)
    expect(screen.getByText(/n'affichent aucun niveau de risque/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rapport FR/ })).toBeInTheDocument()
    // Both panels are rendered inside it, so the whole decision is in one place.
    expect(screen.getByText('Qualification avant diffusion')).toBeInTheDocument()
    expect(screen.getByText('Fiche BEC')).toBeInTheDocument()
  })

  it('takes the status sentence from the verdict rather than asserting all is well', () => {
    // A signal answered "indéterminé" leaves the case open: the chip says « Indéterminé » and the
    // sentence beside it has to agree, which a flat "les signaux relevés sont qualifiés" did not.
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[
          {
            SignalId: 'rule-filing:classement',
            Verdict: 'undetermined',
            Analyst: 'analyste',
            DecidedUtc: new Date().toISOString(),
          },
        ]}
      />
    )

    expect(screen.getAllByText(/Indéterminé/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Le dossier reste ouvert/)).toBeInTheDocument()
    expect(screen.queryByText(/Les signaux relevés sont qualifiés/)).not.toBeInTheDocument()
    expect(screen.queryByText(/sous cette carte/)).not.toBeInTheDocument()
  })

  it('opens the panel for the phase the case is in, and lets the other be reopened', async () => {
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[]}
      />
    )

    // Questions pending: the analyst is answering them, so the case file starts folded. Folded,
    // not unmounted - collapsing must not throw away what was typed.
    expect(screen.getByText(/Les signaux que la donnée ne peut pas trancher seule/)).toBeVisible()
    expect(screen.getByLabelText('Ticket Autotask')).not.toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Déplier la fiche BEC' }))
    expect(screen.getByLabelText('Ticket Autotask')).toBeVisible()
  })

  it('starts on the case file once every question is answered', () => {
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[
          {
            SignalId: 'rule-filing:classement',
            Verdict: 'expected',
            Analyst: 'analyste',
            DecidedUtc: new Date().toISOString(),
          },
        ]}
      />
    )

    expect(screen.getByLabelText('Ticket Autotask')).toBeVisible()
  })

  it('offers the re-run where the collection state is shown', async () => {
    const onRestart = vi.fn()
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[]}
        onRestart={onRestart}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Relancer la collecte' }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('renders nothing while the collection is still running', () => {
    const { container } = renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={{ Waiting: true }}
        tenantFilter="contoso.test"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('PsitBecArchivedEvidenceButton', () => {
  it('fetches the archive only when clicked, then saves it', async () => {
    const refetch = vi.fn().mockResolvedValue({
      data: { Collection: '{"ExtractedAt":"2026-08-20T10:32:00Z"}' },
    })
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isSuccess: false,
      isError: false,
      refetch,
    }))

    const click = vi.fn()
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const element = createElement(tag)
      if (tag === 'a') element.click = click
      return element
    })
    global.URL.createObjectURL = vi.fn(() => 'blob:fake')
    global.URL.revokeObjectURL = vi.fn()

    renderWithProviders(
      <PsitBecArchivedEvidenceButton
        tenantFilter="contoso.test"
        userId="user-guid"
        userPrincipalName="p.martin@contoso.test"
        reference="PSIT-BEC-20260820-AB12"
      />
    )

    // Nothing is pulled on render: the payload is hundreds of kilobytes.
    expect(refetch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Preuves JSON/ }))

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    document.createElement.mockRestore()
  })

  it('says so when the case was closed without a collection to archive', async () => {
    const refetch = vi.fn().mockResolvedValue({ data: { Collection: '' } })
    ApiGetCall.mockImplementation(() => ({
      data: undefined,
      isFetching: false,
      isSuccess: true,
      isError: false,
      refetch,
    }))

    renderWithProviders(
      <PsitBecArchivedEvidenceButton
        tenantFilter="contoso.test"
        userId="user-guid"
        reference="PSIT-BEC-20260820-AB12"
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /Preuves JSON/ }))
    expect(await screen.findByText(/Aucune collecte archivée/)).toBeInTheDocument()
  })
})
