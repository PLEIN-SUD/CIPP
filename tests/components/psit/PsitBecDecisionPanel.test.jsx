import React from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PsitBecDecisionPanel } from '../../../src/components/psit/PsitBecDecisionPanel'
import { PsitBecArchivedEvidenceButton } from '../../../src/components/psit/PsitBecArchivedEvidenceButton'
import { ApiGetCall } from '../../../src/api/ApiCall'

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
  const passthrough =
    (tag) =>
    ({ children }) =>
      React.createElement(tag, null, children)
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

  it('leads with the verdict and the reports, above the checks', () => {
    renderWithProviders(
      <PsitBecDecisionPanel
        userData={userData}
        becData={becData}
        tenantFilter="contoso.test"
        triage={[]}
        onRestart={vi.fn()}
      />
    )

    expect(screen.getByText('Décision et dossier')).toBeInTheDocument()
    // No level while a question is open, and the panel says what that implies.
    expect(screen.getAllByText(/À qualifier/).length).toBeGreaterThan(0)
    expect(screen.getByText(/n'affichent aucun niveau de risque/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rapport FR/ })).toBeInTheDocument()
    // Both panels are rendered inside it, so the whole decision is in one place.
    expect(screen.getByText('Qualification avant diffusion')).toBeInTheDocument()
    expect(screen.getByText('Fiche de dossier')).toBeInTheDocument()
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
