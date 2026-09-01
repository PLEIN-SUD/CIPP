import React from 'react'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import {
  PsitSocDownloadReportButton,
  PsitSocDownloadReportFrDocument,
} from '../../../src/components/psit/PsitSocDownloadReportFr'
import { psitReadDownloadAudit } from '../../../src/utils/psit-soc-download'

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
  })),
  ApiPostCall: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  ApiGetCallWithPagination: vi.fn(() => ({ data: undefined, isFetching: false })),
}))

// jsdom cannot run the real pdf renderer; passthrough stubs let the document tree be asserted as
// plain DOM, which is how the upstream report tests do it. The trade-off is explicit: this proves
// the wording and the structure, never the rendered PDF.
vi.mock('@react-pdf/renderer', () => {
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

const socCase = {
  CaseId: 'PSIT-SOC-20260828-AAAA',
  Tenant: 'client.test',
  TypeId: 20,
  ExternalRef: 'T20260828.0043',
  Entities: { upn: 'y.exemple@client.test' },
  // The reader's shape, not the writer's: PSITListSocCases returns the verdict nested.
  Qualification: { Verdict: 'true-positive', Justification: 'Départ annoncé, volume hors norme' },
  ActionLog: [
    {
      Utc: '2026-08-30T09:00:00Z',
      Action: 'audit-search',
      Detail: 'Recherche lancée',
      Analyst: 'analyste@partner.test',
    },
  ],
  Evidence: {
    download: {
      searchId: 'search-1',
      user: 'y.exemple@client.test',
      startUtc: '2026-08-28T03:27:00Z',
      endUtc: '2026-08-28T19:27:00Z',
      launchedUtc: '2026-08-30T09:00:00Z',
      launchedBy: 'analyste@partner.test',
      summary: {
        FileCount: 370,
        SiteCount: 2,
        Sites: ['https://client.sharepoint.com/sites/Compta/'],
        Extensions: [{ Extension: 'xlsx', Count: 300 }],
        FirstUtc: '2026-08-28T15:20:00Z',
        LastUtc: '2026-08-28T15:50:00Z',
        Addresses: ['203.0.113.9'],
        AddressCount: 1,
        Agents: ['Mozilla/5.0'],
        Operations: [
          { Operation: 'FileDownloaded', Count: 250 },
          { Operation: 'FileAccessed', Count: 120 },
        ],
      },
    },
  },
}

const render = (props = {}) =>
  renderWithProviders(
    <PsitSocDownloadReportFrDocument
      socCase={socCase}
      read={undefined}
      brandingSettings={{}}
      variables={{}}
      {...props}
    />
  )

describe('PsitSocDownloadReportFrDocument', () => {
  it('opens on the outcome, in words for a non-technical reader', () => {
    render()

    expect(screen.getByText(/traités comme une sortie de données/)).toBeInTheDocument()
    // The context sentence tells the reader what the alert family even is.
    expect(screen.getByText(/Ce volume est un signal, pas une conclusion/)).toBeInTheDocument()
  })

  it('never prints a count without its window, and names the search', () => {
    render()

    expect(screen.getByText(/370 fichiers, depuis 2 sites, en 30 minutes/)).toBeInTheDocument()
    expect(screen.getByText(/sur la période du 28 août 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Recherche search-1, lancée le/)).toBeInTheDocument()
  })

  it('separates consulted from downloaded, and explains the difference', () => {
    render()

    expect(screen.getByText(/téléchargé \(250\), consulté \(120\)/)).toBeInTheDocument()
    expect(screen.getByText(/consultation n'emporte pas de copie/)).toBeInTheDocument()
  })

  it('says the numbers come from the dossier copy when the live search is gone', () => {
    render()

    expect(screen.getByText(/conservés au dossier/)).toBeInTheDocument()
  })

  it('reads the live search when it still answers, files included', () => {
    const read = psitReadDownloadAudit({
      Started: true,
      Running: false,
      Records: [
        {
          Name: 'Budget 2026.xlsx',
          Site: 'https://client.sharepoint.com/sites/Compta/',
          Operation: 'FileDownloaded',
          WhenUtc: '2026-08-28T15:20:00Z',
          Ip: '203.0.113.9',
        },
      ],
      Summary: {
        FileCount: 1,
        SiteCount: 1,
        Sites: ['https://client.sharepoint.com/sites/Compta/'],
        Extensions: [{ Extension: 'xlsx', Count: 1 }],
        FirstUtc: '2026-08-28T15:20:00Z',
        LastUtc: '2026-08-28T15:20:00Z',
        Addresses: ['203.0.113.9'],
        AddressCount: 1,
        Agents: ['Mozilla/5.0'],
        Operations: [{ Operation: 'FileDownloaded', Count: 1 }],
      },
      Window: {},
    })

    render({ read })

    expect(screen.getByText('Budget 2026.xlsx')).toBeInTheDocument()
    expect(screen.queryByText(/conservés au dossier/)).not.toBeInTheDocument()
  })

  it('does not conclude legitimacy on an undetermined dossier', () => {
    render({
      socCase: { ...socCase, Qualification: { Verdict: 'undetermined', Justification: '' } },
    })

    expect(screen.getByText(/n'a pas permis de trancher/)).toBeInTheDocument()
    expect(screen.getByText('Document non conclusif')).toBeInTheDocument()
  })
})

describe('PsitSocDownloadReportButton', () => {
  it('stays disabled until the dossier is qualified', () => {
    renderWithProviders(
      <PsitSocDownloadReportButton
        socCase={{ ...socCase, Qualification: null }}
        read={undefined}
      />
    )

    expect(screen.getByRole('button', { name: /Rapport téléchargements/ })).toBeDisabled()
  })

  it('locks an uncontained true positive: a report sent mid-containment describes a fire while it burns', () => {
    renderWithProviders(
      <PsitSocDownloadReportButton socCase={{ ...socCase, Status: 'qualified-tp' }} read={undefined} />
    )

    expect(screen.getByRole('button', { name: /Rapport téléchargements/ })).toBeDisabled()
  })

  it('offers the report once the true positive is contained', () => {
    renderWithProviders(
      <PsitSocDownloadReportButton socCase={{ ...socCase, Status: 'contained' }} read={undefined} />
    )

    expect(screen.getByRole('button', { name: /Rapport téléchargements/ })).toBeEnabled()
  })
})
