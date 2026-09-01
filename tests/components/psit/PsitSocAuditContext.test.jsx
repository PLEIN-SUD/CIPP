import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitSocAuditContext } from '../../../src/components/psit/soc/PsitSocAuditContext'
import { ApiGetCall, ApiPostCall } from '../../../src/api/ApiCall'

// Rendering MUI through jsdom on a cold cache runs past Vitest's 5 s default on a laptop, and a
// timeout reads exactly like a broken assertion. Set per file rather than in vitest.config.mjs,
// which is upstream: no divergence, and the value travels with the tests that need it.
vi.setConfig({ testTimeout: 60000 })

vi.mock('../../../src/api/ApiCall', () => ({
  ApiGetCall: vi.fn(() => ({ data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

const socCase = {
  CaseId: 'PSIT-SOC-20260828-AAAA',
  Tenant: 'contoso.test',
  TypeId: 5,
  Entities: { upn: 'y.exemple@contoso.test', userId: 'u1' },
}

// The endpoint's own shape, PascalCase, as Invoke-PSITExecCaseAuditSearch builds it.
const finishedAnswer = {
  SearchId: 'search-1',
  Status: 'succeeded',
  Running: false,
  Started: true,
  Warnings: [],
  Window: {
    Kind: 'mailbox-rules',
    User: 'y.exemple@contoso.test',
    StartUtc: '2026-08-26T15:27:00.0000000Z',
    EndUtc: '2026-08-28T19:27:00.0000000Z',
    LaunchedUtc: '2026-08-29T08:00:00.0000000Z',
    LaunchedBy: 'analyste@partner.test',
  },
  Records: [
    {
      WhenUtc: '2026-08-28T15:20:00Z',
      Operation: 'New-InboxRule',
      Actor: 'y.exemple@contoso.test',
      Target: 'y.exemple@contoso.test',
      Ip: '203.0.113.9',
      Detail: '[{"Name":"DeleteMessage","Value":"True"}]',
    },
  ],
  Summary: {
    EventCount: 1,
    Operations: [{ Operation: 'New-InboxRule', Count: 1 }],
    Actors: [{ Actor: 'y.exemple@contoso.test', Count: 1 }],
    Addresses: ['203.0.113.9'],
    AddressCount: 1,
    FirstUtc: '2026-08-28T15:20:00Z',
    LastUtc: '2026-08-28T15:20:00Z',
  },
}

const wireApi = ({ audit } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    if (url.includes('PSITExecCaseAuditSearch')) {
      return audit === undefined
        ? { data: undefined, isFetching: true, isFetched: false, isSuccess: false, isError: false }
        : { data: audit, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocAuditContext', () => {
  it('launches the search itself when the dossier has none', () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })
    wireApi({ audit: { Started: false, Running: false, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecCaseAuditSearch',
        data: expect.objectContaining({ CaseId: socCase.CaseId, Start: true }),
      })
    )
  })

  it('says a running search is running, and never shows an empty event list for it', () => {
    wireApi({ audit: { Started: true, Running: true, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Recherche en cours dans le journal d’audit/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun événement/)).not.toBeInTheDocument()
  })

  it('shows what happened, named by its kind, with the window it was counted over', () => {
    wireApi({ audit: finishedAnswer })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Journal d’audit — règles de boîte et transferts/)).toBeInTheDocument()
    expect(screen.getByText('1 événement(s)')).toBeInTheDocument()
    // The rule's substance travels with the row: the delete flag is the story here.
    expect(screen.getByText(/DeleteMessage/)).toBeInTheDocument()
    // A count without its window means nothing.
    expect(screen.getByText(/Fenêtre cherchée : du 26\/08\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/lancée par analyste@partner.test/)).toBeInTheDocument()
  })

  it('treats zero events as a window to widen, not as an all-clear', () => {
    wireApi({
      audit: {
        ...finishedAnswer,
        Records: [],
        Summary: { ...finishedAnswer.Summary, EventCount: 0, Operations: [], Actors: [], Addresses: [], AddressCount: 0 },
      },
    })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/élargir avant de conclure/i)).toBeInTheDocument()
  })

  it('does not launch anything from a dossier that names nobody', () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })
    wireApi({ audit: { Started: false, Running: false, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocAuditContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />)

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/ne nomme aucun utilisateur/)).toBeInTheDocument()
  })

  it('keeps the raw launch response out of the screen', () => {
    // Same lesson as the download panel: a successful launch is already visible (the panel says
    // the search is running); only a refusal needs a voice.
    ApiPostCall.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { data: { SearchId: '84cc3120-dbb4-4d4a-b62b-991ba2eebbf9', Status: 'notStarted', Started: true } },
    })
    wireApi({ audit: { Started: true, Running: true, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByText(/84cc3120/)).not.toBeInTheDocument()
    expect(screen.queryByText('notStarted')).not.toBeInTheDocument()
  })

  it('shows the endpoint warnings where the analyst works', () => {
    wireApi({
      audit: { ...finishedAnswer, Warnings: ['État de la recherche illisible (Graph refused).'] },
    })

    renderWithProviders(<PsitSocAuditContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/État de la recherche illisible/)).toBeInTheDocument()
  })
})
