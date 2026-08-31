import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { PsitSocDownloadContext } from '../../../src/components/psit/soc/PsitSocDownloadContext'
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
  TypeId: 20,
  Entities: { upn: 'y.exemple@contoso.test', userId: 'u1' },
}

// The endpoint's own shape, PascalCase, as Invoke-PSITExecDownloadAudit builds it.
const finishedAnswer = {
  SearchId: 'search-1',
  Status: 'succeeded',
  Running: false,
  Started: true,
  Warnings: [],
  Window: {
    User: 'y.exemple@contoso.test',
    StartUtc: '2026-08-28T03:27:00.0000000Z',
    EndUtc: '2026-08-28T19:27:00.0000000Z',
    LaunchedUtc: '2026-08-29T08:00:00.0000000Z',
    LaunchedBy: 'analyste@partner.test',
  },
  Records: [
    {
      Path: 'https://contoso.sharepoint.com/sites/Compta/Documents partages/Budget 2026.xlsx',
      Name: 'Budget 2026.xlsx',
      Site: 'https://contoso.sharepoint.com/sites/Compta/',
      Operation: 'FileDownloaded',
      WhenUtc: '2026-08-28T15:20:00Z',
      Ip: '203.0.113.9',
      Agent: 'Mozilla/5.0',
    },
    {
      Path: 'https://contoso.sharepoint.com/sites/RH/Documents partages/Paie.xlsx',
      Name: 'Paie.xlsx',
      Site: 'https://contoso.sharepoint.com/sites/RH/',
      Operation: 'FileDownloaded',
      WhenUtc: '2026-08-28T15:50:00Z',
      Ip: '203.0.113.9',
      Agent: 'Mozilla/5.0',
    },
  ],
  Summary: {
    FileCount: 2,
    SiteCount: 2,
    Sites: ['https://contoso.sharepoint.com/sites/Compta/', 'https://contoso.sharepoint.com/sites/RH/'],
    Extensions: [{ Extension: 'xlsx', Count: 2 }],
    FirstUtc: '2026-08-28T15:20:00Z',
    LastUtc: '2026-08-28T15:50:00Z',
    Addresses: ['203.0.113.9'],
    AddressCount: 1,
    Agents: ['Mozilla/5.0'],
  },
}

const wireApi = ({ audit, adminStatus } = {}) => {
  ApiGetCall.mockImplementation((opts) => {
    const url = opts?.url ?? ''
    if (url.includes('PSITExecDownloadAudit')) {
      return audit === undefined
        ? { data: undefined, isFetching: true, isFetched: false, isSuccess: false, isError: false }
        : { data: audit, isFetching: false, isFetched: true, isSuccess: true, isError: false }
    }
    if (url.includes('PSITListUserAdminStatus')) {
      return {
        data: adminStatus ?? { IsAdmin: false, IsEligible: false, ActiveRoles: [], EligibleRoles: [] },
        isFetching: false,
        isFetched: true,
        isSuccess: true,
        isError: false,
      }
    }
    return { data: undefined, isFetching: false, isFetched: false, isSuccess: false, isError: false }
  })
}

describe('PsitSocDownloadContext', () => {
  it('launches the search itself when the dossier has none', () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })
    wireApi({ audit: { Started: false, Running: false, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    // The analyst arrives to an answer being computed, not to a button to find.
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/PSITExecDownloadAudit',
        data: expect.objectContaining({ CaseId: socCase.CaseId, Start: true }),
      })
    )
  })

  it('says a running search is running, and never shows an empty file list for it', () => {
    wireApi({ audit: { Started: true, Running: true, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/Recherche en cours dans le journal d’audit/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucun téléchargement/)).not.toBeInTheDocument()
  })

  it('shows what was taken, with the window it was counted over', () => {
    wireApi({ audit: finishedAnswer })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText('2 fichier(s)')).toBeInTheDocument()
    expect(screen.getAllByText('Budget 2026.xlsx', { exact: false }).length).toBeGreaterThan(0)
    // A count without its window means nothing.
    expect(screen.getByText(/Fenêtre cherchée : du 28\/08\/2026/)).toBeInTheDocument()
    expect(screen.getByText(/lancée par analyste@partner.test/)).toBeInTheDocument()
  })

  it('treats zero files as a window to widen, not as an all-clear', () => {
    wireApi({
      audit: {
        ...finishedAnswer,
        Records: [],
        Summary: { ...finishedAnswer.Summary, FileCount: 0, SiteCount: 0, Extensions: [], Addresses: [], AddressCount: 0 },
      },
    })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/élargir avant de conclure/i)).toBeInTheDocument()
  })

  it('does not launch anything from a dossier that names nobody', () => {
    const mutate = vi.fn()
    ApiPostCall.mockReturnValue({ mutate, isPending: false, isSuccess: false, isError: false })
    wireApi({ audit: { Started: false, Running: false, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(
      <PsitSocDownloadContext socCase={{ ...socCase, Entities: {} }} queryKey="k" />
    )

    expect(mutate).not.toHaveBeenCalled()
    expect(screen.getByText(/ne nomme aucun utilisateur/)).toBeInTheDocument()
  })

  it('keeps the raw launch response out of the screen', () => {
    // Seen in production: the POST answers with the whole audit object, and the results band
    // spilled it as green chips - the search GUID, 'notStarted', the UPN. A successful launch
    // is already visible (the panel says the search is running); only a refusal needs a voice.
    ApiPostCall.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: true,
      isError: false,
      data: { data: { SearchId: '84cc3120-dbb4-4d4a-b62b-991ba2eebbf9', Status: 'notStarted', Started: true } },
    })
    wireApi({ audit: { Started: true, Running: true, Records: [], Summary: null, Warnings: [] } })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    expect(screen.queryByText(/84cc3120/)).not.toBeInTheDocument()
    expect(screen.queryByText('notStarted')).not.toBeInTheDocument()
  })

  it('shows the endpoint warnings where the analyst works', () => {
    wireApi({
      audit: { ...finishedAnswer, Warnings: ['État de la recherche illisible (Graph refused).'] },
    })

    renderWithProviders(<PsitSocDownloadContext socCase={socCase} queryKey="k" />)

    expect(screen.getByText(/État de la recherche illisible/)).toBeInTheDocument()
  })
})
